import swaggerUi from "swagger-ui-express";
import fs from "fs";
import yaml from "js-yaml";
import path from "path";

export function setupSwagger(app) {
  const filePath = path.resolve("./swagger/openapi.yaml");
  const swaggerDocument = yaml.load(fs.readFileSync(filePath, "utf8"));

  const options = {
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: "none"
    }
  };

  app.use("/swagger", swaggerUi.serve, swaggerUi.setup(swaggerDocument, options));
}