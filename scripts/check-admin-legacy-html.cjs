const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const directory = path.join(process.cwd(), 'src', 'screens', 'legacy', 'admin');
const files = fs.readdirSync(directory).filter((file) => file.endsWith('.tsx'));

for (const file of files) {
  const filename = path.join(directory, file);
  const source = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest);
  let html = '';
  source.forEachChild((node) => {
    if (!ts.isVariableStatement(node)) return;
    node.declarationList.declarations.forEach((declaration) => {
      if (declaration.name.getText(source) === 'legacyHtml' && declaration.initializer && ts.isStringLiteral(declaration.initializer)) {
        html = declaration.initializer.text;
      }
    });
  });
  if (!html) continue;
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
  scripts.forEach((script, index) => {
    try {
      new Function(script);
    } catch (error) {
      throw new Error(`${file} script ${index} has invalid JavaScript: ${error.message}`);
    }
  });

  const target = {classList: {add() {}}, insertAdjacentHTML() {}, set innerHTML(_value) {}};
  const documentStub = {
    body: {dataset: {page: 'dashboard'}},
    addEventListener() {},
    querySelector(selector) { return selector === '#admin-app' ? target : null; },
  };
  const windowStub = {__smartlifeSend() {}, addEventListener() {}, alert() {}, location: {hash: ''}, setTimeout() {}};
  try {
    new Function('document', 'window', 'sessionStorage', scripts[0])(
      documentStub,
      windowStub,
      {removeItem() {}},
    );
  } catch (error) {
    throw new Error(`${file} initial render failed: ${error.message}`);
  }
  console.log(`${file}: ${scripts.length} scripts OK`);
}
