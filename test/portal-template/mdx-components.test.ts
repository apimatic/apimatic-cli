import fs from 'node:fs';
import { expect } from 'chai';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import ts from 'typescript';
import { FileName } from '../../src/types/file/fileName';
import { parsePage } from '../../src/types/portal/page';
import {
  FUMADOCS_COMPONENTS,
  GENERATED_PAGE_COMPONENTS,
  isPortalComponent
} from '../../src/types/portal/portal-components';

// The CLI refuses a page naming a component outside its list, so the list has to be the template's own.
describe("the template's MDX components", () => {
  const MDX = 'portal-template/src/components/mdx.tsx';
  const COMPONENTS_PAGE = 'test/resources/portal-inputs/default/src/content/guides/components.mdx';

  /** The object `getMDXComponents` returns, as written. */
  const returnedObject = (source: ts.SourceFile): ts.ObjectLiteralExpression => {
    const getMDXComponents = source.statements.find(
      (statement): statement is ts.FunctionDeclaration =>
        ts.isFunctionDeclaration(statement) && statement.name?.text === 'getMDXComponents'
    );
    const returned = getMDXComponents?.body?.statements.find(ts.isReturnStatement)?.expression;
    if (returned === undefined || !ts.isObjectLiteralExpression(returned)) {
      throw new Error(`${MDX} no longer returns an object from getMDXComponents`);
    }
    return returned;
  };

  /** What `getMDXComponents` registers: Fumadocs' defaults spread in, and the components named after them. */
  const registered = (): string[] => {
    const source = ts.createSourceFile(MDX, fs.readFileSync(MDX, 'utf8'), ts.ScriptTarget.Latest);
    return returnedObject(source).properties.flatMap((property) => {
      if (ts.isShorthandPropertyAssignment(property)) {
        return [property.name.text];
      }
      const isDefaults =
        ts.isSpreadAssignment(property) && property.expression.getText(source) === 'defaultMdxComponents';
      return isDefaults ? Object.keys(defaultMdxComponents) : [];
    });
  };

  it('are the components the CLI accepts on a page', () => {
    const components = registered().filter((name) => !/^[a-z]/.test(name));

    expect(components.sort()).to.deep.equal([...FUMADOCS_COMPONENTS, ...GENERATED_PAGE_COMPONENTS].sort());
  });

  it("include every component the fixture's components page uses", async () => {
    const page = fs.readFileSync(COMPONENTS_PAGE, 'utf8');
    const { components } = await parsePage(page, new FileName('components.mdx'), COMPONENTS_PAGE);

    expect(components).to.not.be.empty;
    expect(components.filter(({ name }) => !isPortalComponent(name))).to.deep.equal([]);
  });
});
