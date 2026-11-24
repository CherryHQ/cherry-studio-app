// Parses each U+001E-separated Markdown document with the parser flags Cherry Mobile's message
// renderer reaches (GFM, default autolinks and admonitions, LaTeX math, superscript) and prints
// one line of inline spans per document.
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "md4c.h"

static int block(MD_BLOCKTYPE type, void *detail, void *userdata) { return 0; }

static const char *span_name(MD_SPANTYPE type) {
  switch (type) {
    case MD_SPAN_EM: return "em";
    case MD_SPAN_STRONG: return "strong";
    case MD_SPAN_CODE: return "code";
    case MD_SPAN_DEL: return "del";
    case MD_SPAN_LATEXMATH: return "math";
    case MD_SPAN_LATEXMATH_DISPLAY: return "dmath";
    case MD_SPAN_SUPERSCRIPT: return "sup";
    case MD_SPAN_A: return "a";
    default: return "span";
  }
}

static int enter_span(MD_SPANTYPE type, void *detail, void *userdata) {
  printf("<%s>", span_name(type));
  return 0;
}

static int leave_span(MD_SPANTYPE type, void *detail, void *userdata) {
  printf("</%s>", span_name(type));
  return 0;
}

static int text(MD_TEXTTYPE type, const MD_CHAR *value, MD_SIZE size, void *userdata) {
  if (type == MD_TEXT_SOFTBR || type == MD_TEXT_BR) fputc(' ', stdout);
  else fwrite(value, 1, size, stdout);
  return 0;
}

int main(void) {
  MD_PARSER parser = {0};
  parser.flags = MD_FLAG_NOHTMLSPANS | MD_FLAG_SPOILERS | MD_FLAG_TABLES | MD_FLAG_STRIKETHROUGH |
                 MD_FLAG_TASKLISTS | MD_FLAG_PERMISSIVEAUTOLINKS | MD_FLAG_LATEXMATHSPANS |
                 MD_FLAG_SUPERSCRIPTS | MD_FLAG_ADMONITIONS;
  parser.enter_block = block;
  parser.leave_block = block;
  parser.enter_span = enter_span;
  parser.leave_span = leave_span;
  parser.text = text;

  size_t capacity = 1 << 16, length = 0;
  char *input = malloc(capacity);
  size_t read;
  while ((read = fread(input + length, 1, capacity - length, stdin)) > 0) {
    length += read;
    if (length == capacity) input = realloc(input, capacity *= 2);
  }

  size_t start = 0;
  for (size_t index = 0; index <= length; index++) {
    if (index < length && input[index] != '\x1e') continue;
    md_parse(input + start, (MD_SIZE)(index - start), &parser, NULL);
    fputc('\n', stdout);
    start = index + 1;
  }
  free(input);
  return 0;
}
