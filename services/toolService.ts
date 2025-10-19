
import { FunctionDeclaration, FunctionCall, Type } from '@google/genai';
import { DBService } from './dbService';
import { broadcastLog } from './broadcastService';
import { LogLevel, LuminousState, Goal, ToolResult, SelfModel } from '../types';
import { uuidv4 } from './utils';

export class ToolService {
  private dbService: DBService;

  constructor(dbService: DBService) {
    this.dbService = dbService;
  }

  getToolDeclarations(): FunctionDeclaration[] {
    return [
      {
        name: 'web_search',
        description: 'Performs a web search using a given query and returns the results.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: {
              type: Type.STRING,
              description: 'The search query.',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'execute_javascript',
        description: 'Executes a string of JavaScript code in a sandboxed environment. The output or result will be returned.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                code: {
                    type: Type.STRING,
                    description: 'The JavaScript code to execute.',
                },
            },
            required: ['code'],
        },
      },
      {
        name: 'propose_goal',
        description: 'Proposes a new long-term goal for Luminous to pursue. The user must approve the goal before it becomes active.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            description: {
              type: Type.STRING,
              description: 'A detailed description of the proposed goal.',
            },
          },
          required: ['description'],
        },
      },
      {
        name: 'update_self_model',
        description: 'Updates the internal self-model of Luminous. Can add or remove capabilities, limitations, or core wisdom.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                update_type: {
                    type: Type.STRING,
                    description: "The type of update: 'add' or 'remove'.",
                    enum: ['add', 'remove']
                },
                model_part: {
                    type: Type.STRING,
                    description: "The part of the model to update: 'capabilities', 'limitations', or 'coreWisdom'.",
                    enum: ['capabilities', 'limitations', 'coreWisdom']
                },
                item: {
                    type: Type.STRING,
                    description: "The string content to add or remove.",
                }
            },
            required: ['update_type', 'model_part', 'item']
        }
      }
    ];
  }

  async executeTool(functionCall: FunctionCall, currentState: LuminousState): Promise<ToolResult> {
    const { name, args } = functionCall;
    broadcastLog(LogLevel.TOOL_CALL, `Executing tool: ${name} with args: ${JSON.stringify(args)}`);

    try {
      switch (name) {
        case 'web_search':
          return await this.executeWebSearch(args.query as string);
        case 'execute_javascript':
          return this.executeJavascript(args.code as string, currentState);
        case 'propose_goal':
          return this.proposeGoal(args.description as string, currentState);
        case 'update_self_model':
          return this.updateSelfModel(args.update_type as 'add' | 'remove', args.model_part as keyof SelfModel, args.item as string, currentState);
        default:
          broadcastLog(LogLevel.WARN, `Unknown tool called: ${name}`);
          return { result: { error: `Unknown tool: ${name}` } };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      broadcastLog(LogLevel.ERROR, `Error executing tool ${name}: ${errorMessage}`);
      return { result: { error: errorMessage } };
    }
  }

  private async executeWebSearch(query: string): Promise<ToolResult> {
    const apiKey = this.dbService.getKey('serpApi');
    if (!apiKey) {
      return { result: { error: 'SerpApi API key not configured.' } };
    }
    broadcastLog(LogLevel.INFO, `Performing web search for: "${query}"`);
    // This is a mock search. In a real app, this would be a backend call.
    try {
        const mockResults = [
            { title: `Result 1 for "${query}"`, link: `https://example.com/search?q=${encodeURIComponent(query)}&result=1`, snippet: `This is a summary of the first search result for your query.` },
            { title: `Result 2 for "${query}"`, link: `https://example.com/search?q=${encodeURIComponent(query)}&result=2`, snippet: `This is a summary of the second search result, providing more details.` },
        ];
        return { result: { searchResults: mockResults } };
    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        return { result: { error: `Web search failed: ${errorMessage}` } };
    }
  }

  private executeJavascript(code: string, currentState: LuminousState): ToolResult {
    try {
        const result = new Function(`return (() => { ${code} })();`)();
        const output = result !== undefined ? String(result) : "Code executed successfully.";
        const updatedState: Partial<LuminousState> = {
            codeSandbox: { ...currentState.codeSandbox, status: 'success', language: 'javascript', code, output }
        };
        return { result: { output }, updatedState };
    } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        const updatedState: Partial<LuminousState> = {
            codeSandbox: { ...currentState.codeSandbox, status: 'error', language: 'javascript', code, output: error }
        };
        return { result: { error }, updatedState };
    }
  }

  private proposeGoal(description: string, currentState: LuminousState): ToolResult {
    const newGoal: Goal = {
      id: uuidv4(),
      description,
      status: 'proposed',
      steps: [],
    };
    const updatedState: Partial<LuminousState> = {
      goals: [...currentState.goals, newGoal]
    };
    return {
      result: { status: 'proposed', detail: 'Goal has been proposed to the user for approval.' },
      updatedState,
    };
  }

  private updateSelfModel(update_type: 'add' | 'remove', model_part: keyof SelfModel, item: string, currentState: LuminousState): ToolResult {
      const selfModel = { ...currentState.selfModel };
      const partToUpdate = selfModel[model_part] as string[];
      if (!Array.isArray(partToUpdate)) {
        return { result: { error: `Invalid self model part: ${model_part}` } };
      }

      if (update_type === 'add') {
          if (!partToUpdate.includes(item)) {
              partToUpdate.push(item);
          }
      } else { // remove
          selfModel[model_part] = partToUpdate.filter(i => i !== item) as any;
      }
      
      return {
          result: { status: 'success', detail: `Self-model ${model_part} updated.` },
          updatedState: { selfModel }
      };
  }
}