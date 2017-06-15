'use strict';
import { Iterables } from '../system';
import { commands, Range, TextDocumentShowOptions, TextEditor, Uri, window } from 'vscode';
import { ActiveEditorCommand, Commands, getCommandUri } from './common';
import { BuiltInCommands } from '../constants';
import { DiffWithWorkingCommandArgs } from './diffWithWorking';
import { GitCommit, GitService, GitUri } from '../gitService';
import { Logger } from '../logger';
import * as moment from 'moment';
import * as pathModule from 'path';

// PATCH(sourcegraph) Add path
import { path as pathLocal } from '../path';
import { env } from 'vscode';

const path = env.appName === 'Sourcegraph' ? pathLocal : pathModule;

export interface DiffWithPreviousCommandArgs {
    commit?: GitCommit;
    line?: number;
    range?: Range;
    showOptions?: TextDocumentShowOptions;
}

export class DiffWithPreviousCommand extends ActiveEditorCommand {

    constructor(private git: GitService) {
        super(Commands.DiffWithPrevious);
    }

    async execute(editor: TextEditor, uri?: Uri, args: DiffWithPreviousCommandArgs = {}): Promise<any> {
        uri = getCommandUri(uri, editor);
        if (uri === undefined) return undefined;

        args.line = args.line || (editor === undefined ? 0 : editor.selection.active.line);

        if (args.commit === undefined || (args.commit.type !== 'file') || args.range !== undefined) {
            const gitUri = await GitUri.fromUri(uri, this.git);

            try {
                const sha = args.commit === undefined ? gitUri.sha : args.commit.sha;

                const log = await this.git.getLogForFile(gitUri.repoPath, gitUri.fsPath, undefined, sha ? undefined : 2, args.range!);
                if (log === undefined) return window.showWarningMessage(`Unable to open compare. File is probably not under source control`);

                args.commit = (sha && log.commits.get(sha)) || Iterables.first(log.commits.values());

                // If the sha is missing, treat it as a DiffWithWorking
                if (gitUri.sha === undefined) return commands.executeCommand(Commands.DiffWithWorking, uri, { commit: args.commit, showOptions: args.showOptions } as DiffWithWorkingCommandArgs);
            }
            catch (ex) {
                Logger.error(ex, 'DiffWithPreviousCommand', `getLogForFile(${gitUri.repoPath}, ${gitUri.fsPath})`);
                return window.showErrorMessage(`Unable to open compare. See output channel for more details`);
            }
        }

        if (args.commit.previousSha === undefined) return window.showInformationMessage(`Commit ${args.commit.shortSha} (${args.commit.author}, ${moment(args.commit.date).fromNow()}) has no previous commit`);

        try {
            // const [rhs, lhs] = await Promise.all([
            //     this.git.getVersionedFile(args.commit.repoPath, args.commit.uri.fsPath, args.commit.sha),
            //     this.git.getVersionedFile(args.commit.repoPath, args.commit.previousUri.fsPath, args.commit.previousSha)
            // ]);
            const commit = args.commit;
            const lhs = GitService.toGitContentUri(commit);
            const rhs = GitService.toGitContentUri(commit.previousSha!, commit.previousShortSha!, commit.previousFileName!, commit.repoPath, commit.previousFileName);
            console.log(`lhs`, lhs);
            console.log(`rhs`, rhs);
            await commands.executeCommand(BuiltInCommands.Diff,
                lhs,
                rhs,
                `${path.basename(args.commit.previousUri.fsPath)} (${args.commit.previousShortSha}) \u2194 ${path.basename(args.commit.uri.fsPath)} (${args.commit.shortSha})`,
                args.showOptions);

            // TODO: Figure out how to focus the left pane
            return await commands.executeCommand(BuiltInCommands.RevealLine, { lineNumber: args.line, at: 'center' });
        }
        catch (ex) {
            Logger.error(ex, 'DiffWithPreviousCommand', 'getVersionedFile');
            return window.showErrorMessage(`Unable to open compare. See output channel for more details`);
        }
    }
}