'use strict';
import { ExtensionContext, languages, window, workspace } from 'vscode';
import { AnnotationController } from './annotations/annotationController';
import { CommandContext, setCommandContext } from './commands';
import { CloseUnchangedFilesCommand, OpenChangedFilesCommand } from './commands';
import { OpenBranchInRemoteCommand, OpenCommitInRemoteCommand, OpenFileInRemoteCommand, OpenInRemoteCommand, OpenRepoInRemoteCommand } from './commands';
import { DiffDirectoryCommand, DiffLineWithPreviousCommand, DiffLineWithWorkingCommand, DiffWithBranchCommand, DiffWithNextCommand, DiffWithPreviousCommand, DiffWithWorkingCommand} from './commands';
import { ShowFileBlameCommand, ShowLineBlameCommand, ToggleFileBlameCommand, ToggleLineBlameCommand } from './commands';
import { ShowBlameHistoryCommand, ShowFileHistoryCommand } from './commands';
import { ShowLastQuickPickCommand } from './commands';
import { ShowQuickBranchHistoryCommand, ShowQuickCurrentBranchHistoryCommand, ShowQuickFileHistoryCommand } from './commands';
import { ShowCommitSearchCommand, ShowQuickCommitDetailsCommand, ShowQuickCommitFileDetailsCommand } from './commands';
import { ShowQuickRepoStatusCommand, ShowQuickStashListCommand } from './commands';
import { StashApplyCommand, StashDeleteCommand, StashSaveCommand } from './commands';
import { ToggleCodeLensCommand } from './commands';
import { Keyboard } from './commands';
import { IConfig } from './configuration';
import { ExtensionKey } from './constants';
import { CurrentLineController } from './currentLineController';
import { GitContentProvider } from './gitContentProvider';
import { GitContextTracker, GitService } from './gitService';
import { GitRevisionCodeLensProvider } from './gitRevisionCodeLensProvider';
import { Logger } from './logger';

// this method is called when your extension is activated
export async function activate(context: ExtensionContext) {
    Logger.configure(context);

    const rootPath = workspace.rootPath && workspace.rootPath.replace(/\\/g, '/');

    const cfg = workspace.getConfiguration().get<IConfig>(ExtensionKey)!;
    const gitPath = cfg.advanced.git;

    try {
        await GitService.getGitPath(gitPath);
    }
    catch (ex) {
        Logger.error(ex, 'Extension.activate');
        await window.showErrorMessage(`GitLens was unable to find Git. Please make sure Git is installed. Also ensure that Git is either in the PATH, or that 'gitlens.advanced.git' is pointed to its installed location.`);
        setCommandContext(CommandContext.Enabled, false);
        return;
    }

    const repoPath = await GitService.getRepoPath(rootPath);

    const git = new GitService(context, repoPath);
    context.subscriptions.push(git);

    const gitContextTracker = new GitContextTracker(git);
    context.subscriptions.push(gitContextTracker);

    context.subscriptions.push(workspace.registerTextDocumentContentProvider(GitContentProvider.scheme, new GitContentProvider(context, git)));

    context.subscriptions.push(languages.registerCodeLensProvider(GitRevisionCodeLensProvider.selector, new GitRevisionCodeLensProvider(context, git)));

    const annotationController = new AnnotationController(context, git, gitContextTracker);
    context.subscriptions.push(annotationController);

    const currentLineController = new CurrentLineController(context, git, gitContextTracker, annotationController);
    context.subscriptions.push(currentLineController);

    context.subscriptions.push(new Keyboard());

    context.subscriptions.push(new CloseUnchangedFilesCommand(git));
    context.subscriptions.push(new OpenChangedFilesCommand(git));
    // PATCH(sourcegraph) Remove copy to clipboard
    // context.subscriptions.push(new CopyMessageToClipboardCommand(git));

    // context.subscriptions.push(new CopyShaToClipboardCommand(git));
    context.subscriptions.push(new DiffDirectoryCommand(git));
    context.subscriptions.push(new DiffLineWithPreviousCommand(git));
    context.subscriptions.push(new DiffLineWithWorkingCommand(git));
    context.subscriptions.push(new DiffWithBranchCommand(git));
    context.subscriptions.push(new DiffWithNextCommand(git));
    context.subscriptions.push(new DiffWithPreviousCommand(git));
    context.subscriptions.push(new DiffWithWorkingCommand(git));
    context.subscriptions.push(new OpenBranchInRemoteCommand(git));
    context.subscriptions.push(new OpenCommitInRemoteCommand(git));
    context.subscriptions.push(new OpenFileInRemoteCommand(git));
    context.subscriptions.push(new OpenInRemoteCommand());
    context.subscriptions.push(new OpenRepoInRemoteCommand(git));
    context.subscriptions.push(new ShowFileBlameCommand(annotationController));
    context.subscriptions.push(new ShowLineBlameCommand(currentLineController));
    context.subscriptions.push(new ToggleFileBlameCommand(annotationController));
    context.subscriptions.push(new ToggleLineBlameCommand(currentLineController));
    context.subscriptions.push(new ShowBlameHistoryCommand(git));
    context.subscriptions.push(new ShowFileHistoryCommand(git));
    context.subscriptions.push(new ShowLastQuickPickCommand());
    context.subscriptions.push(new ShowQuickBranchHistoryCommand(git));
    context.subscriptions.push(new ShowQuickCurrentBranchHistoryCommand(git));
    context.subscriptions.push(new ShowQuickCommitDetailsCommand(git));
    context.subscriptions.push(new ShowQuickCommitFileDetailsCommand(git));
    context.subscriptions.push(new ShowCommitSearchCommand(git));
    context.subscriptions.push(new ShowQuickFileHistoryCommand(git));
    context.subscriptions.push(new ShowQuickRepoStatusCommand(git));
    context.subscriptions.push(new ShowQuickStashListCommand(git));
    context.subscriptions.push(new StashApplyCommand(git));
    context.subscriptions.push(new StashDeleteCommand(git));
    context.subscriptions.push(new StashSaveCommand(git));
    context.subscriptions.push(new ToggleCodeLensCommand(git));
}

// this method is called when your extension is deactivated
export function deactivate() { }
