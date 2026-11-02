import type { DocumentExtractionOptions } from '@/shared/contracts/documentExtraction';
import type { LocalOcrModelId } from '@/shared/contracts/localOcr';

const DOCUMENT_PROMPTS = {
  // Xiaomi's whole-page task; the separate layout detector is not bundled.
  xiaomi:
    'Extract all information from the main body of the document image and represent it ' +
    'in markdown format, ignoring headers and footers. Tables should be expressed in OTSL ' +
    'format, formulas in the document should be represented using LATEX format, and the ' +
    'parsing should be organized according to the reading order.',
  // https://huggingface.co/ATH-MaaS/OvisOCR3/blob/main/prompts/document_markdown.txt
  ovis:
    'Extract all readable content from the image in natural human reading order and output ' +
    'the result as a single Markdown document. For charts or images, represent them using an ' +
    'HTML image tag: <img src="images/bbox_{left}_{top}_{right}_{bottom}.jpg" />, where left, ' +
    'top, right, bottom are bounding box coordinates scaled to [0, 1000). Format formulas as ' +
    'LaTeX. Format tables as HTML: <table>...</table>. Transcribe all other text as standard ' +
    'Markdown. Preserve the original text without translation or paraphrasing.',
};

/** The two models share field constraints, but retain their own trained task instructions. */
export function getLocalOcrPrompt(model: LocalOcrModelId, options?: DocumentExtractionOptions) {
  const task = options?.task ?? 'document';
  const fieldSchema =
    task === 'fields'
      ? {
          type: 'object',
          properties: Object.fromEntries(
            options!.fields!.map((field) => [field, { type: ['string', 'null'] }]),
          ),
          required: options!.fields,
          additionalProperties: false,
        }
      : undefined;
  let prompt = DOCUMENT_PROMPTS[model];
  if (task === 'fields') {
    prompt =
      model === 'ovis'
        ? 'Extract the information from the image using exactly this JSON schema:\n' +
          JSON.stringify(fieldSchema) +
          '\nKeep the values exactly as shown and use empty strings for missing values. Output JSON only.'
        : 'Extract key information in the image\n\nPlease output the key information in JSON format according to the following schema:\n' +
          JSON.stringify(Object.fromEntries(options!.fields!.map((field) => [field, '']))) +
          '\nPreserve exact visible text, including leading zeroes, dates, units and decimal places. Use null for missing values. Return JSON only.';
  } else if (task === 'question') {
    prompt =
      options!.question! +
      (model === 'ovis'
        ? '\n\nPlease reason step by step, and put your final answer within \\boxed{}.'
        : '\nAnswer the question using a single word or phrase.');
  }
  return { prompt, fieldSchema };
}
