import { useEffect, useRef, useState } from 'react';

/** Presentation model shared by local `ask_user_question` and desktop question forms. */
export type QuestionFormOption = { id: string; label: string; description?: string };
export type QuestionFormQuestion = {
  id: string;
  header?: string;
  question: string;
  selection: 'single' | 'multiple';
  options: readonly QuestionFormOption[];
};
export type QuestionFormAnswer = {
  questionId: string;
  selectedOptionIds: string[];
  text: string;
  skipped: boolean;
};

export type UserQuestionComposerProps = {
  questions: readonly QuestionFormQuestion[];
  /** Desktop question forms require every answer; only the local tool accepts a skip. */
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
}: UserQuestionComposerProps) {
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
  const isComplete = questions.every(({ id }) => {
    const value = answers.get(id);
    return (
      value && (value.skipped || value.selectedOptionIds.length > 0 || Boolean(value.text.trim()))
    );
  });

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
      selectedOptionIds:
        question.selection === 'single'
          ? [id]
          : current.selectedOptionIds.includes(id)
            ? current.selectedOptionIds.filter((selected) => selected !== id)
            : [...current.selectedOptionIds, id],
    }));
  }

  function navigate(next: number) {
    if (disabled || submitting.current || !active.current) return;
    setIndex(Math.max(0, Math.min(questions.length - 1, next)));
  }

  function skip() {
    if (!allowSkip) return;
    change(() => ({ ...emptyAnswer, skipped: true }));
    navigate(index + 1);
  }

  async function submit() {
    if (disabled || submitting.current || !active.current || !isComplete) return;
    submitting.current = true;
    setBusy(true);
    setFailed(false);
    const response = questions.map(({ id }) => {
      const answer = answers.get(id)!;
      return { ...answer, text: answer.text.trim(), questionId: id };
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

  return {
    allowSkip,
    answer,
    busy,
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
