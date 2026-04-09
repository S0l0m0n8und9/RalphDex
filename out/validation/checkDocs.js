"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const docsValidator_1 = require("./docsValidator");
async function main() {
    const issues = await (0, docsValidator_1.validateRepositoryDocs)(process.cwd());
    const report = (0, docsValidator_1.formatDocsValidationReport)(issues);
    if (issues.length > 0) {
        console.error(report);
        process.exitCode = 1;
        return;
    }
    console.log(report);
}
void main().catch((error) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(`Documentation validation crashed.\n${message}`);
    process.exitCode = 1;
});
//# sourceMappingURL=checkDocs.js.map