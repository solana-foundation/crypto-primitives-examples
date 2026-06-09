import solanaConfig from '@solana/eslint-config-solana';

export default [
    ...solanaConfig,
    {
        ignores: [
            '**/dist/**',
            '**/node_modules/**',
            '**/target/**',
            '**/generated/**',
            'clients/typescript/src/generated/**',
            'eslint.config.mjs',
            '.remember/**',
            '**/postcss.config.mjs',
            '!**/src/lib/',
            '!**/src/lib/**',
        ],
    },
];
