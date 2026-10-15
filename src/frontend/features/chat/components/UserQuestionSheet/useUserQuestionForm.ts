import { useEffect, useRef, useState } from 'react';

/** Presentation model shared by conversation questions and MCP prompt parameters. */
export type QuestionFormOption = { id: string; label: string; description?: string };
export type QuestionFormQuestion = {
  id: string;
  header?: string;
  question: string;
  description?: string;
  /** Overrides the request's skip policy for a field with its own requirement. */
  required?: boolean;
  input?: { label: string; maxLength?: number; preserveWhitespace?: boolean };
  textChanges?: readonly { before: string; after: string; reason: string }[];
  selection: 'single' | 'multiple';
  options: readonly QuestionFormOption[];
};
export type QuestionFormAnswer = {
  questionId: string;
  selectedOptionIds: string[];
  text: string;
  skipped: boolean;
};

export type UserQuestionFormProps = {
  questions: readonly QuestionFormQuestion[];
  /** Default skip policy for questions without their own requirement. */
  allowSkip: boolean;
  disabled: boolean;
  /**
   * Resolves `applied` once the request is settled and `pending` when the response is in flight
   * without a receipt, such as after a connection loss; rejects when it was refused.
   */
  onRespond(answers: QuestionFormAnswer[]): Promise<'applied' | 'pending'>;
};

type AnswerDraft = Omit<QuestionFormAnswer, 'questionId'>;

const emptyAnswer: AnswerDraft = { selectedOptionIds: [], text: '', skipped: false };

/** The caller keys this form by the complete request so replaced calls cannot share drafts. */
export function useUserQuestionForm({
  questions,
  allowSkip,
  disabled,
  onRespond,
}: UserQuestionFormProps) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState(() => new Map<string, AnswerDraft>());
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const submitting = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const question = questions[index];
  const answer = answers.get(question.id) ?? emptyAnswer;
  const locked = disabled || busy;
  const isLast = index === questions.length - 1;
  const answered = isAnswered(answer);
  const canSkip = !(question.required ?? !allowSkip);
  const isComplete = questions.every(
    ({ id, required }) => !(required ?? !allowSkip) || isAnswered(answers.get(id)),
  );
  const action: 'submit' | 'next' | 'skip' = isLast
    ? 'submit'
    : answered || !canSkip
      ? 'next'
      : 'skip';
  const canAct = action === 'submit' ? isComplete : action === 'next' ? answered : true;

  function change(update: (answer: AnswerDraft) => AnswerDraft) {
    if (disabled || submitting.current || !active.current) return;
    setFailed(false);
    setAnswers((current) =>
      new Map(current).set(question.id, update(current.get(question.id) ?? emptyAnswer)),
    );
  }

  function select(id: string) {
    change((current) => ({
      ...current,
      skipped: false,
      selectedOptionIds: current.selectedOptionIds.includes(id)
        ? current.selectedOptionIds.filter((selected) => selected !== id)
        : question.selection === 'single'
          ? [id]
          : [...current.selectedOptionIds, id],
    }));
  }

  function navigate(next: number) {
    if (disabled || submitting.current || !active.current) return;
    setIndex(Math.max(0, Math.min(questions.length - 1, next)));
  }

  function skip() {
    if (!canSkip) return;
    change(() => ({ ...emptyAnswer, skipped: true }));
    navigate(index + 1);
  }

  async function submit() {
    if (disabled || submitting.current || !active.current || !isComplete) return;
    submitting.current = true;
    setBusy(true);
    setFailed(false);
    const response = questions.map(({ id, input }) => {
      const answer = answers.get(id);
      return answer && isAnswered(answer)
        ? {
            ...answer,
            text: input?.preserveWhitespace ? answer.text : answer.text.trim(),
            skipped: false,
            questionId: id,
          }
        : { ...emptyAnswer, skipped: true, questionId: id };
    });
    try {
      const outcome = await onRespond(response);
      // Keep an applied request locked until its owner removes it. An unconfirmed response
      // unlocks the drafts so the user can resubmit once the owner recovers or fails it.
      if (outcome === 'pending' && active.current) {
        submitting.current = false;
        setBusy(false);
      }
    } catch {
      if (!active.current) return;
      submitting.current = false;
      setBusy(false);
      setFailed(true);
    }
  }

  function advance() {
    if (!canAct) return;
    if (action === 'submit') void submit();
    else if (action === 'skip') skip();
    else navigate(index + 1);
  }

  return {
    action,
    advance,
    allowSkip,
    answer,
    busy,
    canAct,
    failed,
    index,
    isComplete,
    locked,
    navigate,
    question,
    questions,
    select,
    skip,
    submit,
    setText: (text: string) => change((current) => ({ ...current, text, skipped: false })),
  };
}

function isAnswered(answer: AnswerDraft | undefined) {
  return Boolean(answer && (answer.selectedOptionIds.length > 0 || answer.text.trim()));
}
