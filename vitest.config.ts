import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		include: ["test/**/*.test.ts"],
		pool: "forks",
		maxWorkers: 1,
		minWorkers: 1,
		testTimeout: 60_000,
		hookTimeout: 60_000,
	},
});
