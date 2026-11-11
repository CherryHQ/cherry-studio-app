import type { AgentUserQuestions } from '@/shared/contracts/agent';
import type { SkillTextChange } from '@/shared/contracts/skills';
import type { AppLanguage } from '@/shared/utils/languages';

// Backend-owned confirmation copy uses the same resolved app language as the Host.
const copy: Record<AppLanguage, readonly [string, string, string, string]> = {
  'zh-CN': [
    '调整这个技能？',
    '请查看下面的修改。保存后，所有使用这个技能的智能体都会使用调整后的内容。',
    '保存并继续',
    '保持原样',
  ],
  'zh-TW': [
    '調整這個技能？',
    '請查看以下修改。儲存後，所有使用這個技能的智能體都會使用調整後的內容。',
    '儲存並繼續',
    '保持原樣',
  ],
  'en-US': [
    'Adjust this skill?',
    'Review the changes below. Saving updates this skill for every agent using it.',
    'Save and continue',
    'Keep unchanged',
  ],
  'de-DE': [
    'Diesen Skill anpassen?',
    'Sieh dir die Änderungen unten an. Sie gelten nach dem Speichern für alle Agents, die diesen Skill verwenden.',
    'Speichern und fortfahren',
    'Unverändert lassen',
  ],
  'ja-JP': [
    'このスキルを調整しますか？',
    '以下の変更内容をご確認ください。保存すると、このスキルを使うすべてのエージェントに変更が適用されます。',
    '保存して続行',
    '変更せずに保持',
  ],
  'ru-RU': [
    'Адаптировать этот навык?',
    'Просмотрите изменения ниже. После сохранения они будут применяться ко всем агентам, использующим этот навык.',
    'Сохранить и продолжить',
    'Оставить без изменений',
  ],
  'el-GR': [
    'Προσαρμογή αυτής της δεξιότητας;',
    'Ελέγξτε τις αλλαγές παρακάτω. Με την αποθήκευση εφαρμόζονται σε όλους τους πράκτορες που χρησιμοποιούν αυτή τη δεξιότητα.',
    'Αποθήκευση και συνέχεια',
    'Διατήρηση χωρίς αλλαγές',
  ],
  'es-ES': [
    '¿Adaptar esta habilidad?',
    'Revisa los cambios que aparecen a continuación. Al guardarlos, se aplicarán a todos los agentes que usen esta habilidad.',
    'Guardar y continuar',
    'Dejar sin cambios',
  ],
  'fr-FR': [
    'Adapter cette compétence ?',
    'Vérifiez les modifications ci-dessous. Une fois enregistrées, elles s’appliqueront à tous les agents utilisant cette compétence.',
    'Enregistrer et continuer',
    'Garder sans modification',
  ],
  'pt-PT': [
    'Adaptar esta competência?',
    'Reveja as alterações abaixo. Ao guardar, serão aplicadas a todos os agentes que utilizam esta competência.',
    'Guardar e continuar',
    'Manter sem alterações',
  ],
  'ro-RO': [
    'Adaptați această abilitate?',
    'Examinați modificările de mai jos. După salvare, acestea se aplică tuturor agenților care folosesc această abilitate.',
    'Salvați și continuați',
    'Păstrați neschimbat',
  ],
  'vi-VN': [
    'Điều chỉnh kỹ năng này?',
    'Hãy xem các thay đổi bên dưới. Khi lưu, chúng sẽ được áp dụng cho mọi tác nhân sử dụng kỹ năng này.',
    'Lưu và tiếp tục',
    'Giữ nguyên',
  ],
  'tr-TR': [
    'Bu beceri uyarlansın mı?',
    'Aşağıdaki değişiklikleri inceleyin. Kaydedildiğinde bu beceriyi kullanan tüm ajanlara uygulanır.',
    'Kaydet ve devam et',
    'Değiştirme',
  ],
};

export function skillAdaptationQuestion(
  language: AppLanguage,
  name: string,
  changes: readonly SkillTextChange[],
): AgentUserQuestions {
  const [title, description, accept, decline] = copy[language];
  return {
    questions: [
      {
        id: 'skill-adaptation',
        question: `${name}\n${title}`,
        description,
        textChanges: [...changes],
        selection: 'single',
        options: [
          { id: 'adapt', label: accept },
          { id: 'keep', label: decline },
        ],
      },
    ],
  };
}
