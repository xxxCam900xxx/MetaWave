import swaggerUi from "swagger-ui-express";
import fs from "fs";
import yaml from "js-yaml";
import path from "path";

export function setupSwagger(app) {
  const filePath = path.resolve("./openapi.yaml");
  const swaggerDocument = yaml.load(fs.readFileSync(filePath, "utf8"));
  app.use("/swagger", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
}