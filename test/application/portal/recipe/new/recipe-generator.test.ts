import prettier from "prettier";
import yaml from "yaml";
import sinon from "sinon";
import mockFs from "mock-fs";
import fs from "fs";
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

  it("should generate correct script from recipe", async () => {
    const script = await generator["createScriptFromRecipe"](sampleRecipe);
    expect(script).to.include("SampleRecipe");
    expect(script).to.include("showContent");
    expect(script).to.include("showEndpoint");
    expect(script).to.include("endpointPermalink");
  });

  it("should convert string to PascalCase", () => {
    expect(generator["toPascalCase"]("my recipe name")).to.equal("MyRecipeName");
    expect(generator["toPascalCase"]("Another test")).to.equal("AnotherTest");
  });
});
