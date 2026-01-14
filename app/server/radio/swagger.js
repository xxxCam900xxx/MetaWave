import swaggerUi from "swagger-ui-express";
import YAML from "yamljs";

export function setupSwagger(app) {
  const swaggerDoc = YAML.load("./openapi.yaml");

  app.use("/swagger", swaggerUi.serve, swaggerUi.setup(swaggerDoc));
  app.get("/openapi.json", (req, res) => res.json(swaggerDoc));
}