import * as vscode from 'vscode';

/**
 * Wraps vscode.workspace.extractResourceInfo. If the resource is in the current workspace
 * but has no revision in the URI (e.g., 'repo://github.com/my/repo/my/file.txt'), then it
 * adds the current known revision for the current workspace (if any).
 *
 * Callers that need the revision should call this instead of
 * vscode.workspace.extractResourceInfo because the latter only returns a revision that is
 * explicitly specified in the resource URI (which means resources in the current
 * workspace will have no revision).
 */
export function extractResourceInfoAndAddRevision(resource: vscode.Uri): { repo: string, revisionSpecifier?: string, relativePath?: string } | null {
    const info = vscode.workspace.extractResourceInfo(resource);
    if (info && !info.revisionSpecifier && vscode.workspace.rootPath === info.workspace) {
        if (!vscode.scm.activeProvider || !vscode.scm.activeProvider.revision || !vscode.scm.activeProvider.revision.id) {
            throw new Error('unable to resolve SCM revision for resource in current workspace: ' + resource.toString());
        }
        info.revisionSpecifier = vscode.scm.activeProvider.revision.id;
    }
    return info as any;
}
