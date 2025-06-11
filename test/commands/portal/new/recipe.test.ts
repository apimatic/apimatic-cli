import * as path from "path";
import * as fsExtra from "fs-extra";
import { runCommand } from "@oclif/test";
import { expect } from "chai";
import { PortalRecipeBuilder } from "../../../../src/application/portal/new/recipe-builder";
import { PortalRecipeGenerator } from "../../../../src/application/portal/new/recipe-generator";

const COMMAND = "portal:new:recipe";

describe("apimatic portal:new:recipe", function () {
  const tempDirectoryPath = path.join(process.cwd(), "test-source");
  const buildInputDirectoryPath = path.join(process.cwd(), "test", "resources", "build-inputs", "default");
  // Flag validation
  it("validates source folder path exists", async () => {
    const { stdout } = await runCommand([COMMAND, "--folder=non-existent-folder", "--name=TestAPIRecipe"]);
    expect(stdout).to.contain("does not exist");
  });

  it("adds single content step and generates script", async () => {
    const recipeBuilder = new PortalRecipeBuilder("Test API Recipe");
    const recipeGenerator = new PortalRecipeGenerator();
    recipeBuilder.addContentStep("Step 1", "Step 1", "Some content.");
    const script = await recipeGenerator.createScriptFromRecipe(recipeBuilder.build());
    expect(script).to.contain("Step 1");
    expect(script).to.contain("Some content.");
    expect(script).to.contain("showContent");
  });

  it("adds single endpoint step and generates script", async () => {
    const recipeBuilder = new PortalRecipeBuilder("Test API Recipe");
    const recipeGenerator = new PortalRecipeGenerator();
    recipeBuilder.addEndpointStep("Step 1", "Step 1", "Some description", "$e/EndpointGroup/EndpointName");
    const script = await recipeGenerator.createScriptFromRecipe(recipeBuilder.build());
    expect(script).to.contain("Step 1");
    expect(script).to.contain("Some description");
    expect(script).to.contain("$e/EndpointGroup/EndpointName");
    expect(script).to.contain("showEndpoint");
    expect(script).to.contain("description");
    expect(script).to.contain("endpointPermalink");
    expect(script).to.contain("args");
    expect(script).to.contain("verify");
  });

  it("adds content and endpoint steps and generates script", async () => {
    const recipeBuilder = new PortalRecipeBuilder("Test API Recipe");
    const recipeGenerator = new PortalRecipeGenerator();
    recipeBuilder.addEndpointStep("Step 1", "Step 1", "Some description", "$e/EndpointGroup/EndpointName");
    recipeBuilder.addContentStep("Step 1", "Step 1", "Some content.");
    const script = await recipeGenerator.createScriptFromRecipe(recipeBuilder.build());
    expect(script).to.contain("Step 1");
    expect(script).to.contain("Some description");
    expect(script).to.contain("$e/EndpointGroup/EndpointName");
    expect(script).to.contain("showContent");
    expect(script).to.contain("Some content.");
    expect(script).to.contain("showEndpoint");
    expect(script).to.contain("description");
    expect(script).to.contain("endpointPermalink");
    expect(script).to.contain("args");
    expect(script).to.contain("verify");
  });

  it("adds content and endpoint steps, generates script and writes to file", async () => {
    fsExtra.removeSync(tempDirectoryPath);
    fsExtra.copySync(buildInputDirectoryPath, tempDirectoryPath);

    const recipeBuilder = new PortalRecipeBuilder("Test API Recipe");
    const recipeGenerator = new PortalRecipeGenerator();
    recipeBuilder.addEndpointStep("Step 1", "Step 1", "Some description", "$e/EndpointGroup/EndpointName");
    recipeBuilder.addContentStep("Step 1", "Step 1", "Some content.");
    const script = await recipeGenerator.createScriptFromRecipe(recipeBuilder.build());
    const generatedRecipeScriptsDirectoryPath = path.join(tempDirectoryPath, "static", "scripts", "api-recipes");
    await recipeGenerator.saveGeneratedRecipeScriptToBuildDirectory(
      script,
      generatedRecipeScriptsDirectoryPath,
      "TestApiRecipe"
    );

    const scriptFilePath = path.join(generatedRecipeScriptsDirectoryPath, "TestApiRecipe.js");
    expect(fsExtra.existsSync(scriptFilePath)).to.be.true;
    const fileContents = fsExtra.readFileSync(scriptFilePath, "utf-8");
    expect(fileContents).to.contain("Step 1");
    expect(fileContents).to.contain("Some description");
    expect(fileContents).to.contain("$e/EndpointGroup/EndpointName");
    expect(fileContents).to.contain("showContent");
    expect(fileContents).to.contain("Some content.");
    expect(fileContents).to.contain("showEndpoint");
    expect(fileContents).to.contain("description");
    expect(fileContents).to.contain("endpointPermalink");
    expect(fileContents).to.contain("args");
    expect(fileContents).to.contain("verify");
    fsExtra.removeSync(tempDirectoryPath);
  });
});
