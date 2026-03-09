import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
	...nextCoreWebVitals,
	...nextTypescript,
	{
		rules: {
			"@typescript-eslint/no-explicit-any": "warn",
			"@typescript-eslint/no-empty-object-type": "warn",
			"@typescript-eslint/no-require-imports": "warn",
		},
	},
];

export default config;