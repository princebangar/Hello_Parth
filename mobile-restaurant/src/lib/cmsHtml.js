// The admin editor saves a blank line as <p><br></p>. On a phone those spacers on top of the paragraph margins
// leave screen-high gaps, so the paragraph margin alone separates the blocks.
export function dropEmptyParagraphs(html) {
  return String(html || '').replace(/<p>(\s|&nbsp;|<br\s*\/?>)*<\/p>/gi, '');
}
