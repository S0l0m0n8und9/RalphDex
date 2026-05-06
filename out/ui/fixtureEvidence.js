"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderUiFixtureEvidence = renderUiFixtureEvidence;
const node_crypto_1 = require("node:crypto");
const panelHtml_1 = require("./panelHtml");
const sidebarHtml_1 = require("./sidebarHtml");
function renderUiFixtureEvidence(fixtures, nonce = 'fixture-evidence') {
    return [...fixtures]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((fixture) => {
        const panelHtml = (0, panelHtml_1.buildPanelDashboardHtml)(fixture.state, nonce);
        const sidebarHtml = (0, sidebarHtml_1.buildDashboardHtml)(fixture.state, nonce);
        return {
            id: fixture.id,
            description: fixture.description,
            panelHash: hashHtml(panelHtml),
            sidebarHash: hashHtml(sidebarHtml),
            panelHtml,
            sidebarHtml
        };
    });
}
function hashHtml(value) {
    return (0, node_crypto_1.createHash)('sha256').update(value).digest('hex');
}
//# sourceMappingURL=fixtureEvidence.js.map