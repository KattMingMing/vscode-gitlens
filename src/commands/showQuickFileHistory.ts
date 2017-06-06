'use strict';
import { commands, Range, TextEditor, Uri, window } from 'vscode';
import { ActiveEditorCachedCommand, Commands, getCommandUri } from './common';
import { GitService, GitUri, IGitLog } from '../gitService';
import { Logger } from '../logger';
import { CommandQuickPickItem, FileHistoryQuickPick } from '../quickPicks';
import { ShowQuickCommitFileDetailsCommandArgs } from './showQuickCommitFileDetails';
import * as pathModule from 'path';

// PATCH(sourcegraph) Add path
import { path as pathLocal } from '../path';
import { env } from 'vscode';

const path = env.appName === 'Sourcegraph' ? pathLocal : pathModule;

export interface ShowQuickFileHistoryCommandArgs {
    log?: IGitLog;
    maxCount?: number;
    range?: Range;

    goBackCommand?: CommandQuickPickItem;
    nextPageCommand?: CommandQuickPickItem;
}

export class ShowQuickFileHistoryCommand extends ActiveEditorCachedCommand {

    constructor(private git: GitService) {
        super(Commands.ShowQuickFileHistory);
    }

    async execute(editor: TextEditor, uri?: Uri, args: ShowQuickFileHistoryCommandArgs = {}) {
        uri = getCommandUri(uri, editor);
        if (uri === undefined) return commands.executeCommand(Commands.ShowQuickCurrentBranchHistory);

        const gitUri = await GitUri.fromUri(uri, this.git);

        if (args.maxCount == null) {
            args.maxCount = this.git.config.advanced.maxQuickHistory;
        }

        const progressCancellation = FileHistoryQuickPick.showProgress(gitUri);
        try {
            if (args.log === undefined) {
                args.log = await this.git.getLogForFile(gitUri.repoPath, gitUri.fsPath, gitUri.sha, args.maxCount, args.range);
                if (args.log === undefined) return window.showWarningMessage(`Unable to show file history. File is probably not under source control`);
            }

            if (progressCancellation.token.isCancellationRequested) return undefined;

            const pick = await FileHistoryQuickPick.show(this.git, args.log, gitUri, progressCancellation, args.goBackCommand, args.nextPageCommand);
            if (pick === undefined) return undefined;

            if (pick instanceof CommandQuickPickItem) return pick.execute();

            // Create a command to get back to where we are right now
            const currentCommand = new CommandQuickPickItem({
                label: `go back \u21A9`,
                description: `\u00a0 \u2014 \u00a0\u00a0 to history of \u00a0$(file-text) ${path.basename(pick.commit.fileName)}${gitUri.sha ? ` from \u00a0$(git-commit) ${gitUri.shortSha}` : ''}`
            }, Commands.ShowQuickFileHistory, [
                    uri,
                    args
                ]);

            return commands.executeCommand(Commands.ShowQuickCommitFileDetails,
                new GitUri(pick.commit.uri, pick.commit),
                {
                    commit: pick.commit,
                    fileLog: args.log,
                    sha: pick.commit.sha,
                    goBackCommand: currentCommand
                } as ShowQuickCommitFileDetailsCommandArgs);
        }
        catch (ex) {
            Logger.error(ex, 'ShowQuickFileHistoryCommand');
            return window.showErrorMessage(`Unable to show file history. See output channel for more details`);
        }
        finally {
            progressCancellation.dispose();
        }
    }
}