'use strict';
import { Iterables, Strings } from '../system';
import { commands, QuickPickOptions, TextDocumentShowOptions, Uri, window } from 'vscode';
import { Commands, DiffWithWorkingCommandArgs, OpenChangedFilesCommandArgs, ShowQuickBranchHistoryCommandArgs, ShowQuickRepoStatusCommandArgs, ShowQuickStashListCommandArgs } from '../commands';
import { CommandQuickPickItem, getQuickPickIgnoreFocusOut, OpenFileCommandQuickPickItem, QuickPickItem } from './common';
import { GlyphChars } from '../constants';
import { GitStatus, GitStatusFile, GitUri } from '../gitService';
import { Keyboard, Keys } from '../keyboard';
import * as path from 'path';

export class OpenStatusFileCommandQuickPickItem extends OpenFileCommandQuickPickItem {

    constructor(status: GitStatusFile, item?: QuickPickItem) {
        const icon = status.getIcon();
        const description = status.getFormattedDirectory(true);

        super(status.Uri, item || {
            label: `${status.staged ? '$(check)' : GlyphChars.Space.repeat(3)}${Strings.pad(icon, 2, 2)} ${path.basename(status.fileName)}`,
            description: description
        });
    }

    onDidPressKey(key: Keys): Promise<{} | undefined> {
        return commands.executeCommand(Commands.DiffWithWorking,
            this.uri,
            {
                showOptions: {
                    preserveFocus: true,
                    preview: false
                } as TextDocumentShowOptions
            } as DiffWithWorkingCommandArgs) as Promise<{} | undefined>;
    }
}

export class OpenStatusFilesCommandQuickPickItem extends CommandQuickPickItem {

    constructor(statuses: GitStatusFile[], item?: QuickPickItem) {
        const uris = statuses.map(_ => _.Uri);

        super(item || {
            label: `$(file-symlink-file) Open Changed Files`,
            description: ''
            // detail: `Opens all of the changed files in the repository`
        }, Commands.OpenChangedFiles, [
                undefined,
                {
                    uris
                } as OpenChangedFilesCommandArgs
            ]);
    }
}

export class RepoStatusQuickPick {

    static async show(status: GitStatus, goBackCommand?: CommandQuickPickItem): Promise<OpenStatusFileCommandQuickPickItem | OpenStatusFilesCommandQuickPickItem | CommandQuickPickItem | undefined> {
        // Sort the status by staged and then filename
        const files = status.files;
        files.sort((a, b) => (a.staged ? -1 : 1) - (b.staged ? -1 : 1) || a.fileName.localeCompare(b.fileName));

        const added = files.filter(_ => _.status === 'A' || _.status === '?');
        const deleted = files.filter(_ => _.status === 'D');
        const changed = files.filter(_ => _.status !== 'A' && _.status !== '?' && _.status !== 'D');

        const hasStaged = files.some(_ => _.staged);

        let stagedStatus = '';
        let unstagedStatus = '';
        if (hasStaged) {
            const stagedAdded = added.filter(_ => _.staged).length;
            const stagedChanged = changed.filter(_ => _.staged).length;
            const stagedDeleted = deleted.filter(_ => _.staged).length;

            stagedStatus = `+${stagedAdded} ~${stagedChanged} -${stagedDeleted}`;
            unstagedStatus = `+${added.length - stagedAdded} ~${changed.length - stagedChanged} -${deleted.length - stagedDeleted}`;
        }
        else {
            unstagedStatus = `+${added.length} ~${changed.length} -${deleted.length}`;
        }

        const items = Array.from(Iterables.map(files, s => new OpenStatusFileCommandQuickPickItem(s))) as (OpenStatusFileCommandQuickPickItem | OpenStatusFilesCommandQuickPickItem | CommandQuickPickItem)[];

        const currentCommand = new CommandQuickPickItem({
            label: `go back ${GlyphChars.ArrowBack}`,
            description: `${Strings.pad(GlyphChars.Dash, 2, 3)} to ${GlyphChars.Space}$(git-branch) ${status.branch} status`
        }, Commands.ShowQuickRepoStatus, [
                undefined,
                {
                    goBackCommand
                } as ShowQuickRepoStatusCommandArgs
            ]);

        if (hasStaged) {
            let index = 0;
            const unstagedIndex = files.findIndex(_ => !_.staged);
            if (unstagedIndex > -1) {
                items.splice(unstagedIndex, 0, new CommandQuickPickItem({
                    label: `Unstaged Files`,
                    description: unstagedStatus
                }, Commands.ShowQuickRepoStatus, [
                        undefined,
                        {
                            goBackCommand
                        } as ShowQuickRepoStatusCommandArgs
                    ]));

                items.splice(unstagedIndex, 0, new OpenStatusFilesCommandQuickPickItem(files.filter(_ => _.status !== 'D' && _.staged), {
                    label: `${GlyphChars.Space.repeat(4)} $(file-symlink-file) Open Staged Files`,
                    description: ''
                }));

                items.push(new OpenStatusFilesCommandQuickPickItem(files.filter(_ => _.status !== 'D' && !_.staged), {
                    label: `${GlyphChars.Space.repeat(4)} $(file-symlink-file) Open Unstaged Files`,
                    description: ''
                }));
            }

            items.splice(index++, 0, new CommandQuickPickItem({
                label: `Staged Files`,
                description: stagedStatus
            }, Commands.ShowQuickRepoStatus, [
                    undefined,
                    {
                        goBackCommand
                    } as ShowQuickRepoStatusCommandArgs
                ]));
        }
        else if (files.some(_ => !_.staged)) {
            items.splice(0, 0, new CommandQuickPickItem({
                label: `Unstaged Files`,
                description: unstagedStatus
            }, Commands.ShowQuickRepoStatus, [
                    undefined,
                    {
                        goBackCommand
                    } as ShowQuickRepoStatusCommandArgs
                ]));
        }

        if (files.length) {
            items.push(new OpenStatusFilesCommandQuickPickItem(files.filter(_ => _.status !== 'D')));
            items.push(new CommandQuickPickItem({
                label: '$(x) Close Unchanged Files',
                description: ''
            }, Commands.CloseUnchangedFiles));
        }
        else {
            items.push(new CommandQuickPickItem({
                label: `No changes in the working tree`,
                description: ''
            }, Commands.ShowQuickRepoStatus, [
                    undefined,
                    {
                        goBackCommand
                    } as ShowQuickRepoStatusCommandArgs
                ]));
        }

        items.splice(0, 0, new CommandQuickPickItem({
            label: `$(repo) Show Stashed Changes`,
            description: `${Strings.pad(GlyphChars.Dash, 2, 3)} shows stashed changes in the repository`
        }, Commands.ShowQuickStashList, [
                new GitUri(Uri.file(status.repoPath), { fileName: '', repoPath: status.repoPath }),
                {
                    goBackCommand: currentCommand
                } as ShowQuickStashListCommandArgs
            ]));

        if (status.upstream && status.state.ahead) {
            items.splice(0, 0, new CommandQuickPickItem({
                label: `$(cloud-upload)${GlyphChars.Space} ${status.state.ahead} Commit${status.state.ahead > 1 ? 's' : ''} ahead of ${GlyphChars.Space}$(git-branch) ${status.upstream}`,
                description: `${Strings.pad(GlyphChars.Dash, 2, 3)} shows commits in ${GlyphChars.Space}$(git-branch) ${status.branch} but not ${GlyphChars.Space}$(git-branch) ${status.upstream}`
            }, Commands.ShowQuickBranchHistory, [
                    new GitUri(Uri.file(status.repoPath), { fileName: '', repoPath: status.repoPath, sha: `${status.upstream}..${status.branch}` }),
                    {
                        branch: status.branch,
                        maxCount: 0,
                        goBackCommand: currentCommand
                    } as ShowQuickBranchHistoryCommandArgs
                ]));
        }

        if (status.upstream && status.state.behind) {
            items.splice(0, 0, new CommandQuickPickItem({
                label: `$(cloud-download)${GlyphChars.Space} ${status.state.behind} Commit${status.state.behind > 1 ? 's' : ''} behind ${GlyphChars.Space}$(git-branch) ${status.upstream}`,
                description: `${Strings.pad(GlyphChars.Dash, 2, 3)} shows commits in ${GlyphChars.Space}$(git-branch) ${status.upstream} but not ${GlyphChars.Space}$(git-branch) ${status.branch}${status.sha ? ` (since ${GlyphChars.Space}$(git-commit) ${status.sha.substring(0, 8)})` : ''}`
            }, Commands.ShowQuickBranchHistory, [
                    new GitUri(Uri.file(status.repoPath), { fileName: '', repoPath: status.repoPath, sha: `${status.branch}..${status.upstream}` }),
                    {
                        branch: status.upstream,
                        maxCount: 0,
                        goBackCommand: currentCommand
                    } as ShowQuickBranchHistoryCommandArgs
                ]));
        }

        if (status.upstream && !status.state.ahead && !status.state.behind) {
            items.splice(0, 0, new CommandQuickPickItem({
                label: `$(git-branch) ${status.branch} is up-to-date with ${GlyphChars.Space}$(git-branch) ${status.upstream}`,
                description: ''
            }, Commands.ShowQuickRepoStatus, [
                    undefined,
                    {
                        goBackCommand
                    } as ShowQuickRepoStatusCommandArgs
                ]));
        }

        if (goBackCommand) {
            items.splice(0, 0, goBackCommand);
        }

        const scope = await Keyboard.instance.beginScope({ left: goBackCommand });

        const pick = await window.showQuickPick(items, {
            matchOnDescription: true,
            placeHolder: `status of ${status.branch}${status.upstream ? ` ${Strings.pad(GlyphChars.ArrowLeftRight, 1, 1)} ${status.upstream}` : ''}`,
            ignoreFocusOut: getQuickPickIgnoreFocusOut(),
            onDidSelectItem: (item: QuickPickItem) => {
                scope.setKeyCommand('right', item);
            }
        } as QuickPickOptions);

        await scope.dispose();

        return pick;
    }
}