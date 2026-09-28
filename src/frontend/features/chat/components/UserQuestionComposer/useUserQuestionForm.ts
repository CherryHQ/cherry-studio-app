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
  onRespond(answers: QuestionFormAnswer[]): Promise<void>;
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
      await onRespond(response);
      // Keep the accepted request locked until its owner removes it.
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
