/**
 * Generates TypeScript and Rust clients from the Codama IDL.
 */

import { renderVisitor as renderJavaScriptVisitor } from '@codama/renderers-js';
import { renderVisitor as renderRustVisitor } from '@codama/renderers-rust';
import { createFromJson } from 'codama';
import fs from 'fs';
import path from 'path';

import { preserveConfigFiles } from './lib/utils';

const projectRoot = path.join(__dirname, '..');
const idlDir = path.join(projectRoot, 'idl');
const idl = fs.readFileSync(path.join(idlDir, 'crypto_primitives.json'), 'utf-8');
const rustClientsDir = path.join(projectRoot, 'clients', 'rust');
const typescriptClientsDir = path.join(projectRoot, 'clients', 'typescript');

async function main() {
    const codama = createFromJson(idl);

    const configPreserver = preserveConfigFiles(typescriptClientsDir, rustClientsDir);

    codama.accept(
        renderRustVisitor(path.join(rustClientsDir, 'src', 'generated'), {
            crateFolder: rustClientsDir,
            deleteFolderBeforeRendering: true,
            formatCode: true,
        }),
    );

    await codama.accept(
        renderJavaScriptVisitor(path.join(typescriptClientsDir, 'src', 'generated'), {
            deleteFolderBeforeRendering: true,
            formatCode: true,
        }),
    );

    configPreserver.restore();

    console.log('Client generation complete!');
}

void main();
