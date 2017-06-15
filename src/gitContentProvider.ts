'use strict';
import { ExtensionContext, TextDocumentContentProvider, Uri, window } from 'vscode';
import { DocumentSchemes } from './constants';
import { GitService } from './gitService';
import { Logger } from './logger';
import * as pathModule from 'path';

// PATCH(sourcegraph) Add path
import { path as pathLocal } from './path';
import { env } from 'vscode';

const path = env.appName === 'Sourcegraph' ? pathLocal : pathModule;

export class GitContentProvider implements TextDocumentContentProvider {

    static scheme = DocumentSchemes.GitLensGit;

    constructor(context: ExtensionContext, private git: GitService) { }

    async provideTextDocumentContent(uri: Uri): Promise<string> {
        const data = GitService.fromGitContentUri(uri);
        const fileName = data.originalFileName || data.fileName;
        try {
            console.log(`getVersionedFiletext -- data: ${JSON.stringify(data)} -- filename: ${fileName}`);
            let text = await this.git.getVersionedFileText(data.repoPath, fileName, data.sha)
            if (data.decoration) {
                text = `${data.decoration}\n${text}`;
            }
            return text;
        }
        catch (ex) {
            Logger.error(ex, 'GitContentProvider', 'getVersionedFileText');
            await window.showErrorMessage(`Unable to show Git revision ${data.sha.substring(0, 8)} of '${path.relative(data.repoPath, fileName)}'`);
            return '';
        }
    }
}