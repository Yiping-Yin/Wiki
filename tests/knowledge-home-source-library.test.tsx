import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';

const repoRoot = path.resolve(__dirname, '..');

function loadTsx(relativePath: string) {
  const filePath = path.join(repoRoot, relativePath);
  const sourceText = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(relativePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  return { sourceText, sourceFile };
}

function visit(node: ts.Node, predicate: (node: ts.Node) => boolean): ts.Node | undefined {
  if (predicate(node)) return node;
  let found: ts.Node | undefined;
  node.forEachChild((child) => {
    if (!found) found = visit(child, predicate);
  });
  return found;
}

function findJsxOpeningElement(sourceFile: ts.SourceFile, name: string) {
  return visit(sourceFile, (node) =>
    ts.isJsxSelfClosingElement(node) && ts.isIdentifier(node.tagName) && node.tagName.text === name
  ) as ts.JsxSelfClosingElement | undefined;
}

function findCallExpression(sourceFile: ts.SourceFile, callee: string) {
  return visit(sourceFile, (node) =>
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === callee
  ) as ts.CallExpression | undefined;
}

function jsxExpressionText(
  element: ts.JsxSelfClosingElement | ts.JsxOpeningElement,
  propName: string,
  sourceFile: ts.SourceFile,
) {
  const prop = element.attributes.properties.find(
    (attribute): attribute is ts.JsxAttribute =>
      ts.isJsxAttribute(attribute) && ts.isIdentifier(attribute.name) && attribute.name.text === propName,
  );

  assert.ok(prop, `missing JSX prop ${propName}`);
  assert.ok(prop.initializer && ts.isJsxExpression(prop.initializer), `JSX prop ${propName} is not an expression`);
  assert.ok(prop.initializer.expression, `JSX prop ${propName} is empty`);
  return prop.initializer.expression.getText(sourceFile);
}

function normalizedJsxText(element: ts.JsxElement, sourceFile: ts.SourceFile) {
  return element.children
    .map((child) => child.getText(sourceFile))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

test('KnowledgeHomeClient forwards runtime groups and mutation handlers into KnowledgeHomeStatic', () => {
  const { sourceText, sourceFile } = loadTsx('app/knowledge/KnowledgeHomeClient.tsx');
  const knowledgeHomeStatic = findJsxOpeningElement(sourceFile, 'KnowledgeHomeStatic');
  const refreshCall = findCallExpression(sourceFile, 'refreshKnowledgeNav');

  assert.ok(knowledgeHomeStatic, 'KnowledgeHomeStatic callsite not found');
  assert.ok(refreshCall, 'refreshKnowledgeNav call not found');
  assert.equal(jsxExpressionText(knowledgeHomeStatic, 'sourceLibraryGroups', sourceFile), 'currentGroups');
  assert.equal(jsxExpressionText(knowledgeHomeStatic, 'onAddGroup', sourceFile), 'onAddGroup');
  assert.equal(jsxExpressionText(knowledgeHomeStatic, 'onRenameGroup', sourceFile), 'onRenameGroup');
  assert.equal(jsxExpressionText(knowledgeHomeStatic, 'onDeleteGroup', sourceFile), 'onDeleteGroup');
  assert.equal(jsxExpressionText(knowledgeHomeStatic, 'onMoveCategory', sourceFile), 'onMoveCategory');
  assert.equal(jsxExpressionText(knowledgeHomeStatic, 'busyKey', sourceFile), 'busyKey');
  assert.equal(jsxExpressionText(knowledgeHomeStatic, 'isPending', sourceFile), 'isPending');
  assert.equal(jsxExpressionText(knowledgeHomeStatic, 'errorMessage', sourceFile), 'errorMessage');

  assert.match(sourceText, /const resolvedGroups = \(sourceLibraryGroups \?\? groups \?\? \[\]\)\.map\(/);
  assert.match(sourceText, /void runMutation\('group:add', '\/api\/source-library\/groups'/);
  assert.match(sourceText, /void runMutation\(`group:rename:\$\{groupId\}`, '\/api\/source-library\/groups', \{/);
  assert.match(sourceText, /void runMutation\(`group:delete:\$\{groupId\}`, '\/api\/source-library\/groups', \{/);
  assert.match(sourceText, /void runMutation\(`membership:\$\{categorySlug\}`, '\/api\/source-library\/membership', \{/);
  assert.match(sourceText, /void refreshKnowledgeNav\(\);/);
});

test('KnowledgeHomeStatic wires group controls to the supplied mutation callbacks', () => {
  const { sourceText, sourceFile } = loadTsx('app/knowledge/KnowledgeHomeStatic.tsx');

  assert.match(sourceText, /\(sourceLibraryGroups \?\? groups \?\? \[\]\)\.map\(/);
  assert.match(sourceText, /onAddGroup = \(\) => \{\}/);
  assert.match(sourceText, /onRenameGroup = \(\) => \{\}/);
  assert.match(sourceText, /onDeleteGroup = \(\) => \{\}/);
  assert.match(sourceText, /onMoveCategory = \(\) => \{\}/);
  assert.match(sourceText, /Grouping changes affect Loom metadata only\. Original source files stay unchanged\./);
  assert.doesNotMatch(sourceText, /buildSourceLibraryGroups/);

  const buttons = [] as ts.JsxElement[];
  visit(sourceFile, (node) => {
    if (
      ts.isJsxElement(node) &&
      ts.isIdentifier(node.openingElement.tagName) &&
      node.openingElement.tagName.text === 'button'
    ) {
      buttons.push(node);
    }
    return false;
  });

  const buttonText = (element: ts.JsxElement) => normalizedJsxText(element, sourceFile);
  const addGroupButton = buttons.find((element) => buttonText(element) === 'Add group');
  const renameGroupButton = buttons.find((element) => buttonText(element) === 'Rename group');
  const deleteGroupButton = buttons.find((element) => buttonText(element) === 'Delete group');
  const selectElement = visit(sourceFile, (node) =>
    ts.isJsxElement(node) &&
    ts.isIdentifier(node.openingElement.tagName) &&
    node.openingElement.tagName.text === 'select'
  ) as ts.JsxElement | undefined;

  assert.ok(addGroupButton, 'Add group button not found');
  assert.ok(renameGroupButton, 'Rename group button not found');
  assert.ok(deleteGroupButton, 'Delete group button not found');
  assert.ok(selectElement, 'Move-to-group select not found');

  assert.equal(jsxExpressionText(addGroupButton.openingElement, 'onClick', sourceFile), 'onAddGroup');
  assert.equal(
    jsxExpressionText(renameGroupButton.openingElement, 'onClick', sourceFile),
    '() => onRenameGroup(group.id, group.label)',
  );
  assert.equal(
    jsxExpressionText(deleteGroupButton.openingElement, 'onClick', sourceFile),
    '() => onDeleteGroup(group.id, group.label)',
  );
  assert.equal(
    jsxExpressionText(selectElement.openingElement, 'onChange', sourceFile),
    '(event) => onMoveCategory(item.slug, event.target.value)',
  );
  assert.equal(jsxExpressionText(selectElement.openingElement, 'disabled', sourceFile), 'busy');
});

test('knowledge category routes are constrained to source-library categories only', () => {
  const { sourceText } = loadTsx('app/knowledge/[category]/page.tsx');

  assert.match(sourceText, /getSourceLibraryCategories/);
  assert.doesNotMatch(sourceText, /getKnowledgeCategories/);
});
