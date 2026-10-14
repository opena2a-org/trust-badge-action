# Badge placement

The action auto-places the badge after existing badges or the first heading. An existing OpenA2A badge for the same package is replaced where it is, on the same line; when it is the first thing on a line it shares with other text, the start marker goes on the line above it, since GitHub shows a line that starts with an HTML comment as raw text.

Badges for other packages are left as they are, and so is badge text GitHub shows as code or HTML rather than as a badge: in a code block, an HTML comment, a `<pre>`, `<script>`, `<style>` or `<textarea>` block, or an HTML block such as `<div>` with no blank line between the tag and the badge.

To control placement manually, add markers:

```markdown
<!-- opena2a-trust-badge -->
<!-- /opena2a-trust-badge -->
```
