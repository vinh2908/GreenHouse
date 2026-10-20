// Source inventory is deliberately NOT marked as a runtime pass.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const out = path.resolve('reports/qa-2026-10-20');
fs.mkdirSync(out, { recursive: true });
const rows = [];
function walk(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap(e => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}
for (const root of [
  'apps/mobile/app',
  'apps/mobile/components',
  'apps/mobile/hooks',
  'apps/admin/app',
  'apps/admin/components',
  'apps/api/src/modules',
]) {
  for (const file of walk(root).filter(f => /\.tsx?$/.test(f))) {
    const text = fs.readFileSync(file, 'utf8');
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const role = file.includes('admin')
      ? 'admin'
      : /\(helper\)|helper-/.test(file)
        ? 'helper'
        : /\(customer\)/.test(file)
          ? 'customer'
          : 'shared';
    function add(kind, node, detail) {
      rows.push({
        role,
        kind,
        file: file.replaceAll('\\', '/'),
        line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
        detail: detail.replace(/\s+/g, ' ').slice(0, 300),
        status: 'NOT_RUN',
      });
    }
    if (
      file.endsWith('.tsx') &&
      !file.includes('components') &&
      !file.includes('hooks') &&
      !file.includes('_layout') &&
      !file.includes('layout.tsx')
    )
      add('screen', sf, path.basename(file));
    function visit(n) {
      if (
        ts.isJsxAttribute(n) &&
        /^(onPress|onClick|onSubmit|onChange|onChangeText|onValueChange|onRefresh|onRequestClose|onEndReached|onLongPress)$/.test(
          n.name.getText(sf),
        )
      )
        add('interaction', n, n.getText(sf));
      if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
        const tag = n.tagName.getText(sf);
        if (
          /^(Button|TouchableOpacity|Pressable|button|a)$/.test(tag) &&
          !n.attributes.properties.some(
            p => ts.isJsxAttribute(p) && /^(onPress|onClick|href)$/.test(p.name.getText(sf)),
          )
        )
          add('interaction-needs-review', n, n.getText(sf));
      }
      if (
        ts.isCallExpression(n) &&
        /\.(on|emitToUser|emitToJob|emitToConversation)$/.test(n.expression.getText(sf))
      )
        add('event', n, n.getText(sf));
      if (
        ts.isDecorator(n) &&
        /^@(Get|Post|Patch|Put|Delete|SubscribeMessage)\(/.test(n.getText(sf))
      )
        add('endpoint-event', n, n.parent.getText(sf).slice(0, 300));
      ts.forEachChild(n, visit);
    }
    visit(sf);
  }
}
fs.writeFileSync(path.join(out, 'source-inventory.json'), JSON.stringify(rows, null, 2));
const fields = ['role', 'kind', 'file', 'line', 'detail', 'status'];
fs.writeFileSync(
  path.join(out, 'source-inventory.csv'),
  '\uFEFF' +
    [
      fields.join(','),
      ...rows.map(r => fields.map(k => '"' + String(r[k]).replaceAll('"', '""') + '"').join(',')),
    ].join('\n'),
);
console.log(
  JSON.stringify(
    rows.reduce((a, r) => {
      const k = `${r.role}/${r.kind}`;
      a[k] = (a[k] || 0) + 1;
      return a;
    }, {}),
    null,
    2,
  ),
);
