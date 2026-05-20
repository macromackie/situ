const ansiPattern =
  // eslint-disable-next-line no-control-regex
  /[\u001B\u009B](?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001B\\))/g;

/**
 * Removes terminal control sequences from PTY output.
 */
export function stripAnsi(input: { readonly text: string }): string {
  return input.text.replace(ansiPattern, "");
}

/**
 * Converts terminal newlines into ordinary text newlines.
 */
export function normalizeTerminalText(input: { readonly text: string }): string {
  return input.text.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}
