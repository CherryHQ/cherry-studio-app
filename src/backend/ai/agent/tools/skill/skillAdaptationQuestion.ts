import type { AgentUserQuestions } from '@/shared/contracts/agent';
import type { SkillTextChange } from '@/shared/contracts/skills';
import type { AppLanguage } from '@/shared/utils/languages';

// Backend-owned confirmation copy uses the same resolved app language as the Host.
const copy: Record<AppLanguage, readonly [string, string, string, string]> = {
  'zh-CN': [
    '适配本地 Skill？',
    '保存后会修改本地 Skill，影响所有使用它的 Agent。仅替换执行方式或删除明确可选步骤，主要内容保持不变。',
    '适配并继续',
    '这次不修改',
  ],
  'zh-TW': [
    '調整本機 Skill？',
    '儲存後會修改本機 Skill，影響所有使用它的 Agent。僅替換執行方式或刪除明確可選步驟，主要內容保持不變。',
    '調整並繼續',
    '這次不修改',
  ],
  'en-US': [
    'Adapt this local Skill?',
    'Saving changes the local Skill for every Agent using it. Only execution methods or explicitly optional steps change; the main instructions stay intact.',
    'Adapt and continue',
    'Keep unchanged',
  ],
  'de-DE': [
    'Lokalen Skill anpassen?',
    'Das Speichern ändert den lokalen Skill für alle Agents, die ihn verwenden. Nur Ausführungsweisen oder ausdrücklich optionale Schritte ändern sich; die Hauptanweisungen bleiben erhalten.',
    'Anpassen und fortfahren',
    'Unverändert lassen',
  ],
  'ja-JP': [
    'ローカル Skill を調整しますか？',
    '保存すると、この Skill を使うすべての Agent に変更が適用されます。実行方法の置換や明示的な任意手順の削除のみ行い、主要な指示は維持します。',
    '調整して続行',
    '今回は変更しない',
  ],
  'ru-RU': [
    'Адаптировать локальный Skill?',
    'Сохранение изменит локальный Skill для всех использующих его Agent. Меняются только способы выполнения или явно необязательные шаги; основные инструкции сохраняются.',
    'Адаптировать и продолжить',
    'Не изменять',
  ],
  'el-GR': [
    'Προσαρμογή τοπικού Skill;',
    'Η αποθήκευση αλλάζει το τοπικό Skill για όλους τους Agent που το χρησιμοποιούν. Αλλάζουν μόνο τρόποι εκτέλεσης ή ρητά προαιρετικά βήματα· οι βασικές οδηγίες διατηρούνται.',
    'Προσαρμογή και συνέχεια',
    'Χωρίς αλλαγές',
  ],
  'es-ES': [
    '¿Adaptar este Skill local?',
    'Al guardar, se modifica el Skill local para todos los Agent que lo usan. Solo cambian los métodos de ejecución o los pasos explícitamente opcionales; se conservan las instrucciones principales.',
    'Adaptar y continuar',
    'Dejar sin cambios',
  ],
  'fr-FR': [
    'Adapter ce Skill local ?',
    'L’enregistrement modifie le Skill local pour tous les Agent qui l’utilisent. Seuls les méthodes d’exécution ou les étapes explicitement facultatives changent ; les instructions principales sont conservées.',
    'Adapter et continuer',
    'Garder sans modification',
  ],
  'pt-PT': [
    'Adaptar este Skill local?',
    'Guardar altera o Skill local para todos os Agent que o utilizam. Só mudam os métodos de execução ou os passos explicitamente opcionais; as instruções principais mantêm-se.',
    'Adaptar e continuar',
    'Manter sem alterações',
  ],
  'ro-RO': [
    'Adaptați acest Skill local?',
    'Salvarea modifică Skill-ul local pentru toți Agent care îl folosesc. Se schimbă doar metodele de execuție sau pașii explicit opționali; instrucțiunile principale rămân intacte.',
    'Adaptați și continuați',
    'Păstrați neschimbat',
  ],
  'vi-VN': [
    'Điều chỉnh Skill cục bộ?',
    'Khi lưu, Skill cục bộ sẽ thay đổi cho mọi Agent sử dụng nó. Chỉ thay thế cách thực hiện hoặc xóa các bước được ghi rõ là tùy chọn; hướng dẫn chính được giữ nguyên.',
    'Điều chỉnh và tiếp tục',
    'Giữ nguyên',
  ],
  'tr-TR': [
    'Yerel Skill uyarlansın mı?',
    'Kaydetmek, yerel Skill’i onu kullanan tüm Agent için değiştirir. Yalnızca yürütme yöntemleri veya açıkça isteğe bağlı adımlar değişir; ana talimatlar korunur.',
    'Uyarla ve devam et',
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
        question: `${title} · ${name}`,
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
