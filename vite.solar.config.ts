import { mergeConfig } from "vite";
import application from "./vite.config";

// The synthetic visual preview needs no environment files or backend service.
export default mergeConfig(application, { envDir: false });
