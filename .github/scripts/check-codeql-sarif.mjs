#!/usr/bin/env node

import { readFileSync } from 'node:fs';

const sarifPath = process.argv[2];

if (!sarifPath) {
    console.error('Usage: node .github/scripts/check-codeql-sarif.mjs <result.sarif>');
    process.exit(2);
}

const sarif = JSON.parse(readFileSync(sarifPath, 'utf8'));
const findings = [];

for (const run of Array.isArray(sarif.runs) ? sarif.runs : []) {
    const driver = run.tool && run.tool.driver ? run.tool.driver : {};
    const rules = new Map((Array.isArray(driver.rules) ? driver.rules : []).map((rule) => [rule.id, rule]));

    for (const result of Array.isArray(run.results) ? run.results : []) {
        const rule = rules.get(result.ruleId);
        const defaultConfig = rule && rule.defaultConfiguration ? rule.defaultConfiguration : {};
        const level = result.level || defaultConfig.level || 'warning';
        const resultMessage = result.message || {};
        const message = resultMessage.text || resultMessage.markdown || '';
        const locations = Array.isArray(result.locations) ? result.locations : [];
        const location = locations[0] && locations[0].physicalLocation ? locations[0].physicalLocation : {};
        const artifactLocation = location.artifactLocation || {};
        const region = location.region || {};
        const uri = artifactLocation.uri || 'unknown';
        const line = region.startLine || 1;

        findings.push({
            level,
            line,
            message,
            ruleId: result.ruleId || 'unknown',
            uri,
        });
    }
}

if (findings.length > 0) {
    console.error(`CodeQL produced ${findings.length} finding(s).`);
    for (const finding of findings) {
        console.error(`- ${finding.level} ${finding.ruleId} ${finding.uri}:${finding.line} ${finding.message}`);
    }
    process.exit(1);
}

console.log('No CodeQL findings.');
