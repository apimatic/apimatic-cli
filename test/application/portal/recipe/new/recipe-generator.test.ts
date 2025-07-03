import prettier from "prettier";
import yaml from "yaml";
import sinon from "sinon";
import mockFs from "mock-fs";
import fs from "fs";
import path from "path";
import { expect } from "chai";
import { PortalRecipeGenerator } from "../../../../../src/application/portal/recipe/recipe-generator";
import { SerializableRecipe } from "../../../../../src/types/recipe/recipe";

describe("PortalRecipeGenerator", () => {
  let generator: PortalRecipeGenerator;
  const sampleRecipe: SerializableRecipe = {
    name: "Sample Recipe",
    steps: [
      {
        key: "step1",
        name: "Step 1",
        type: "content",
        config: { content: "Some content" }
      },
      {
        key: "step2",
        name: "Step 2",
        type: "endpoint",
        config: { description: "desc", endpointPermalink: "permalink" }
      }
    ]
  };

  beforeEach(() => {
    sinon.stub(prettier, "format").callsFake((code: any) => code);
    generator = new PortalRecipeGenerator();
    mockFs({
      "toc.yml": "",
      "build.json": JSON.stringify({}),
      "content": {},
      "static": {}
    });
  });

  afterEach(() => {
    sinon.restore();
    mockFs.restore();
  });

  it("should create a recipe and call all internal methods", async () => {
    const tocFileContent = { toc: [] };
    const buildConfig = {};
    const tocFilePath = "toc.yml";
    const recipeName = "Sample Recipe";
    const recipeFileName = "sample-recipe";
    const buildConfigFilePath = "build.json";
    const contentFolderPath = ".";
    await generator.createRecipe(
      sampleRecipe,
      buildConfig,
      tocFileContent,
      tocFilePath,
      recipeName,
      recipeFileName,
      buildConfigFilePath,
      contentFolderPath
    );
    expect(fs.existsSync(path.join("content", "recipes", `${recipeFileName}.md`))).to.be.true;
    expect(fs.existsSync(path.join("static", "scripts", "recipes", `${recipeFileName}.js`))).to.be.true;
  });

  it("should add a new recipe to TOC if not present", async () => {
    const tocData = { toc: [] };
    const tocFilePath = "toc.yml";
    await generator["addRecipeToToc"](tocData, tocFilePath, "Recipe Name", "recipe-file");
    const written = fs.readFileSync(tocFilePath, "utf-8");
    expect(written).to.include("API Recipes");
    expect(written).to.include("recipe-file.md");
    const tocObj = yaml.parse(written);
    const apiRecipesGroup = tocObj.toc.find((item: any) => item.group === "API Recipes");
    const recipeFiles = apiRecipesGroup ? apiRecipesGroup.items.map((item: any) => item.file) : [];
    expect(recipeFiles.filter((file: string) => file === "recipes/recipe-file.md")).to.have.lengthOf(1);
  });

  it("should not duplicate recipe in TOC if already present", async () => {
    const tocData = { toc: [{ group: "API Recipes", items: [{ page: "Recipe Name", file: "recipes/recipe-file.md" }] }] };
    const tocFilePath = "toc.yml";
    fs.writeFileSync(tocFilePath, yaml.stringify(tocData));
    await generator["addRecipeToToc"](tocData, tocFilePath, "Recipe Name", "recipe-file");
    const written = fs.readFileSync(tocFilePath, "utf-8");
    const tocObj = yaml.parse(written);
    const apiRecipesGroup = tocObj.toc.find((item: any) => item.group === "API Recipes");
    const recipeFiles = apiRecipesGroup ? apiRecipesGroup.items.map((item: any) => item.file) : [];
    expect(recipeFiles.filter((file: string) => file === "recipes/recipe-file.md")).to.have.lengthOf(1);
  });

  it("should register a workflow in build config", async () => {
    const buildConfig = {};
    const buildConfigFilePath = "build.json";
    await generator["registerRecipeInBuildConfigFile"](buildConfig, "Recipe Name", "recipe-file", buildConfigFilePath);
    const written = fs.readFileSync(buildConfigFilePath, "utf-8");
    expect(written).to.include("Recipe Name");
    expect(written).to.include("recipe-file");
  });

  it("should write recipes config to build config file", async () => {
    const buildConfigFilePath = "build.json";
    const recipesConfig = JSON.stringify({ workflows: [{ name: "Test", permalink: "page:recipes/test" }] });
    await generator["writeRecipesConfigToBuildConfigFile"](recipesConfig, buildConfigFilePath);
    const written = fs.readFileSync(buildConfigFilePath, "utf-8");
    expect(written).to.include("workflows");
    expect(written).to.include("Test");
  });

  it("should create a markdown file in the correct location", async () => {
    await generator["createMarkdownFile"]("test-recipe", ".");
    expect(fs.existsSync(path.join("content", "recipes", "test-recipe.md"))).to.be.true;
    const content = fs.readFileSync(path.join("content", "recipes", "test-recipe.md"), "utf-8");
    expect(content).to.include("Guided Walkthrough");
  });

  it("should generate correct script from recipe", async () => {
    const script = await generator["createScriptFromRecipe"](sampleRecipe);
    expect(script).to.include("SampleRecipe");
    expect(script).to.include("showContent");
    expect(script).to.include("showEndpoint");
    expect(script).to.include("endpointPermalink");
  });

  it("should save and format generated recipe script", async () => {
    const script = "export default function Test() { return {}; }";
    const dir = path.join("static", "scripts", "recipes");
    await generator["saveGeneratedRecipeScriptToBuildDirectory"](script, dir, "test-recipe");
    expect(fs.existsSync(path.join(dir, "test-recipe.js"))).to.be.true;
    const content = fs.readFileSync(path.join(dir, "test-recipe.js"), "utf-8");
    expect(content).to.include("export default function Test");
  });

  it("should convert string to PascalCase", () => {
    expect(generator["toPascalCase"]("my recipe name")).to.equal("MyRecipeName");
    expect(generator["toPascalCase"]("Another test")).to.equal("AnotherTest");
  });
});
