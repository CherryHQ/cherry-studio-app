// Compile against the vendored YAML scanner with -funsigned-char, as on Android ARM.
// This exercises the scanner directly; no device or Tree-sitter runtime is required.
#include <assert.h>
#include <stdbool.h>
#include <stddef.h>
#include <string.h>

#include "scanner.c"

typedef struct {
  TSLexer lexer;
  const char *input;
  size_t position;
  size_t end;
  size_t advances;
} TestLexer;

static void advance(TSLexer *lexer, bool skip) {
  (void)skip;
  TestLexer *test = (TestLexer *)lexer;
  // Catch loss of progress without allowing a malformed tag to hang the regression.
  assert(++test->advances <= strlen(test->input) + 8);
  if (test->input[test->position]) test->position++;
  lexer->lookahead = (unsigned char)test->input[test->position];
}

static void mark_end(TSLexer *lexer) {
  TestLexer *test = (TestLexer *)lexer;
  test->end = test->position;
}

static TestLexer create_lexer(const char *input) {
  TestLexer test = {0};
  test.input = input;
  test.lexer.lookahead = (unsigned char)input[0];
  test.lexer.advance = advance;
  test.lexer.mark_end = mark_end;
  return test;
}

static void check_failure_status(const char *input) {
  Scanner scanner = {0};
  TestLexer uri = create_lexer(input);
  TestLexer uri_char = create_lexer(input);
  TestLexer tag_char = create_lexer(input);
  assert(scn_uri_esc(&scanner, &uri.lexer) == SCN_FAIL);
  assert(scn_ns_uri_char(&scanner, &uri_char.lexer) == SCN_FAIL);
  assert(scn_ns_tag_char(&scanner, &tag_char.lexer) == SCN_FAIL);
}

static void check_tag(const char *input, bool accepted, size_t end) {
  Scanner scanner = {0};
  TestLexer test = create_lexer(input);
  assert(scn_tag(&scanner, &test.lexer, 0) == accepted);
  if (accepted) assert(test.end == end);
}

int main(void) {
  check_failure_status("%");
  check_failure_status("%A");
  check_failure_status("%GG");
  check_failure_status("%0G");

  Scanner scanner = {0};
  TestLexer valid_escape = create_lexer("%20");
  assert(scn_uri_esc(&scanner, &valid_escape.lexer) == SCN_SUCC);
  assert(valid_escape.position == 3);
  TestLexer stop = create_lexer(">");
  assert(scn_ns_uri_char(&scanner, &stop.lexer) == SCN_STOP);

  check_tag("!<a%GG>", false, 0);
  check_tag("!<a%0G>", false, 0);
  check_tag("!<a%>", false, 0);
  check_tag("!<a%20>", true, strlen("!<a%20>"));
  check_tag("!foo%GG ", true, strlen("!foo"));
  check_tag("!foo%20 ", true, strlen("!foo%20"));

  TestLexer prefix = create_lexer("tag:example%GG ");
  assert(scn_dir_tag_pfx(&scanner, &prefix.lexer, 0));
  assert(prefix.end == strlen("tag:example"));
  return 0;
}
