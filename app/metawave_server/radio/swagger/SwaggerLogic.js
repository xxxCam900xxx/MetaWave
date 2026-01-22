import swaggerUi from "swagger-ui-express";
import fs from "fs";
import yaml from "js-yaml";
import path from "path";
import { fileURLToPath } from "url";

export function setupSwagger(app) {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const filePath = path.join(__dirname, "openapi.yaml");

  let swaggerDocument;
  try {
    const fileContents = fs.readFileSync(filePath, "utf8");
    swaggerDocument = yaml.load(fileContents);
  } catch (err) {
    console.error(`Failed to load OpenAPI spec from ${filePath}:`, err);
    swaggerDocument = { openapi: "3.0.0", info: { title: "Swagger load error", version: "0.0.0" } };
  }

  const options = {
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: "none"
    }
  };

  app.use("/swagger", swaggerUi.serve, swaggerUi.setup(swaggerDocument, options));
}