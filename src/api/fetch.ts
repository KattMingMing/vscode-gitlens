import 'isomorphic-fetch';
import * as vscode from 'vscode';
import { doFetch as fetch } from './xhr';

const blameDataCache = new Map<string, string>();

export function fetchBlameData(repo: string, rev: string, path: string, startLine: number = 0, endLine: number = 0): Promise<string> {
    const key = `${repo}:${path}:${rev}:${startLine}:${endLine}`;
    const cachedBlameData = blameDataCache.get(key);
    if (cachedBlameData) {
        return Promise.resolve(cachedBlameData);
    }

    return fetchGQL(`query getBlameData($repo: String, $rev: String, $path: String, $startLine: Int, $endLine: Int) {
        root {
            repository(uri: $repo) {
                commit(rev: $rev) {
                    commit {
                        file(path: $path) {
                            blameRaw(startLine: $startLine, endLine: $endLine)
                        }
                    }
                }
            }
        }
    }`, { repo, rev, path, startLine, endLine }).then(query => {
            if (!query || !query.data || !query.data.root) {
                return null;
            }
            const root = query.data.root;
            if (!root.repository || !root.repository.commit || !root.repository.commit.commit) {
                return null;
            }
            const commit = root.repository && root.repository.commit.commit;
            if (!commit || !commit.file) {
                return null;
            }
            blameDataCache.set(key, commit.file.blameRaw);
            return commit.file.blameRaw;
        });
}

/**
 * gitCmdCache caches the result for a git command based. This helps prevent multiple round trip fetches
 * for content we have already resolved.
 */
const gitCmdCache = new Map<string, string>();

export async function fetchForGitCmd(repo: string, params: string[]): Promise<string> {
    const key = `${repo}:${params.toString()}`;
    const cachedResponse = gitCmdCache.get(key);
    if (cachedResponse) {
        console.log(`returning cached response... - key...`, key);
        return Promise.resolve(cachedResponse);
    }

    return fetchGQL(`query gitCmdRaw($repo: String, $params: [String]) {
        root {
            repository(uri: $repo) {
                gitCmdRaw(params: $params)
            }
        }
    }`, { repo, params }).then(query => {
            if (!query || !query.data || !query.data.root) {
                return null;
            }
            const root = query.data.root;
            if (!root.repository || !root.repository.gitCmdRaw) {
                return null;
            }
            gitCmdCache.set(key, root.repository.gitCmdRaw);
            return root.repository.gitCmdRaw;
        });
}

function fetchGQL(query: string, variables: { [name: string]: any }): Promise<any> {
    const endpoint = vscode.workspace.getConfiguration('remote').get<string>('endpoint');
    // The X-Requested-By header is required for the Sourcegraph API to allow
    // the use of cookie auth (to protect against CSRF).
    return fetch(`${endpoint}/.api/graphql`, { method: 'POST', body: JSON.stringify({ query, variables }), 'x-sourcegraph-client': 'gitlens-extension', headers: { 'X-Requested-By': '_' } })
        .then(resp => resp.json())
        .then(json => json)
        .catch(err => {
            return err;
        });
}
