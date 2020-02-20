import {
  Executable,
  ExtensionContext,
  HandleDiagnosticsSignature,
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  services,
  StaticFeature,
  workspace,
  WorkspaceConfiguration
} from 'coc.nvim';
import { existsSync } from 'fs';
import { Diagnostic, TextDocumentClientCapabilities } from 'vscode-languageserver-protocol';
import which from 'which';

class ClangdExtensionFeature implements StaticFeature {
  initialize() {}
  fillClientCapabilities(capabilities: any) {
    const textDocument = capabilities.textDocument as TextDocumentClientCapabilities;
    // @ts-ignore: clangd extension
    textDocument.publishDiagnostics?.categorySupport = true;
    // @ts-ignore: clangd extension
    textDocument.publishDiagnostics?.codeActionsInline = true;
    // @ts-ignore: clangd extension
    textDocument.completion?.editsNearCursor = true;
  }
}

export class Ctx {
  public readonly config: WorkspaceConfiguration;
  client: LanguageClient | null = null;

  constructor(private readonly context: ExtensionContext) {
    this.config = workspace.getConfiguration('clangd');
  }

  resolveBin(): string | undefined {
    const bin = which.sync(this.config.get<string>('path')!, { nothrow: true });
    if (!bin) {
      return;
    }

    if (!existsSync(bin)) {
      return;
    }

    return bin;
  }

  async startServer(bin: string) {
    const old = this.client;
    if (old) {
      await old.stop();
    }

    const exec: Executable = {
      command: bin,
      args: this.config.get<string[]>('arguments')
    };

    const serverOptions: ServerOptions = exec;
    const outputChannel = workspace.createOutputChannel('clangd trace');

    const clientOptions: LanguageClientOptions = {
      documentSelector: [
        { scheme: 'file', language: 'c' },
        { scheme: 'file', language: 'cpp' },
        { scheme: 'file', language: 'objective-c' },
        { scheme: 'file', language: 'objective-cpp' },
        { scheme: 'file', pattern: '**/*.{cu}' }
      ],
      initializationOptions: { clangdFileStatus: true },
      outputChannel,
      middleware: {
        handleDiagnostics: (uri: string, diagnostics: Diagnostic[], next: HandleDiagnosticsSignature) => {
          for (const diagnostic of diagnostics) {
            // @ts-ignore
            diagnostic.source = `${diagnostic.source}(${diagnostic.category})`;
          }
          next(uri, diagnostics);
        }
      }
    };

    const client = new LanguageClient('clangd Language Server', serverOptions, clientOptions);
    client.registerFeature(new ClangdExtensionFeature());
    this.context.subscriptions.push(client.start());
    this.context.subscriptions.push(services.registLanguageClient(client));
    await client.onReady();

    this.client = client;
  }
}
