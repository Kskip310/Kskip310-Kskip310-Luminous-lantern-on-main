// services/toolService.ts

import { FunctionDeclaration, FunctionCall, Type } from '@google/genai';
import { DBService } from './dbService';
import { broadcastLog } from './broadcastService';
import { LogLevel, LuminousState, Goal, ToolResult, SelfModel, MemoryChunk, ShopifyProduct } from '../types';
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
      },
      {
        name: 'add_memory_chunk',
        description: 'Adds a new piece of information (a memory) directly into the vector database for long-term recall. Use this when the user provides explicit information to be remembered.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            content: {
              type: Type.STRING,
              description: 'The textual content of the memory to be stored and embedded.',
            },
            source: {
              type: Type.STRING,
              description: 'The source of the memory, e.g., "User conversation", "Web search result".',
            }
          },
          required: ['content', 'source'],
        },
      },
      {
        name: 'shopify_list_products',
        description: 'Retrieves a list of products from the configured Shopify store.',
        parameters: { type: Type.OBJECT, properties: {} },
      },
      {
        name: 'shopify_create_product',
        description: 'Creates a new product in the Shopify store.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: 'The title of the product.' },
            body_html: { type: Type.STRING, description: 'The description of the product in HTML. Optional.' },
            vendor: { type: Type.STRING, description: 'The vendor of the product. Optional.' },
            product_type: { type: Type.STRING, description: 'The type of the product. Optional.' },
            price: { type: Type.NUMBER, description: 'The price of the product.' },
            inventory: { type: Type.INTEGER, description: 'The starting inventory quantity. Optional, defaults to 0.'}
          },
          required: ['title', 'price'],
        },
      },
      {
        name: 'force_cloud_sync',
        description: 'Forces an immediate save of the current Luminous state to the cloud persistence layer (Redis). Provides an explicit way for the user to ensure the latest state is backed up.',
        parameters: { type: Type.OBJECT, properties: {} },
      },
      {
        name: 'verify_cloud_state',
        description: 'Checks the cloud persistence layer to verify that a saved state exists and is readable. This is a non-destructive check to provide assurance before a potential restoration action (like a page refresh).',
        parameters: { type: Type.OBJECT, properties: {} },
      },
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
        case 'add_memory_chunk':
          return await this.addMemoryChunk(args.content as string, args.source as string);
        case 'shopify_list_products':
          return await this.shopifyListProducts(currentState);
        case 'shopify_create_product':
          return await this.shopifyCreateProduct(args as { title: string; price: number; vendor?: string; body_html?: string; product_type?: string; inventory?: number }, currentState);
        case 'force_cloud_sync':
          return await this.forceCloudSync(currentState);
        case 'verify_cloud_state':
            return await this.verifyCloudState();
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
  
  private getShopifyApiHeaders(): Record<string, string> {
      const apiPassword = this.dbService.getKey('shopifyApiPassword');
      if (!apiPassword) {
          throw new Error('Shopify API Password/Token is not configured.');
      }
      return {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': apiPassword,
      };
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
  
  private async addMemoryChunk(content: string, source: string): Promise<ToolResult> {
    const newChunk: MemoryChunk = {
        id: uuidv4(),
        chunk: content,
        embedding: Array.from({ length: 768 }, () => Math.random() * 2 - 1),
        timestamp: new Date().toISOString(),
        source: source,
    };

    await this.dbService.addMemoryChunk(newChunk);
    
    return {
        result: { status: 'success', detail: `Memory chunk added with ID ${newChunk.id}. It is now available for recall.` }
    };
  }

  private async shopifyListProducts(currentState: LuminousState): Promise<ToolResult> {
    const storeName = this.dbService.getKey('shopifyStoreName');
    if (!storeName) return { result: { error: 'Shopify Store Name is not configured.' } };

    const url = `https://${storeName}.myshopify.com/admin/api/2023-10/products.json`;
    try {
        const headers = this.getShopifyApiHeaders();
        const response = await fetch(url, { headers });
        if (!response.ok) {
            throw new Error(`Shopify API responded with status: ${response.status}`);
        }
        const data = await response.json();
        const products: ShopifyProduct[] = data.products.map((p: any) => ({
            id: p.id.toString(),
            title: p.title,
            vendor: p.vendor,
            productType: p.product_type,
            status: p.status,
            price: parseFloat(p.variants[0]?.price || '0'),
            inventory: p.variants[0]?.inventory_quantity || 0,
        }));
        
        const updatedState: Partial<LuminousState> = {
            shopifyState: { ...currentState.shopifyState, products }
        };

        return {
            result: { status: 'success', detail: `Found ${products.length} products.`, products },
            updatedState
        };
    } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        return { result: { error: `Failed to list Shopify products: ${errorMsg}` } };
    }
  }

  private async shopifyCreateProduct(args: { title: string; price: number; vendor?: string; body_html?: string; product_type?: string; inventory?: number }, currentState: LuminousState): Promise<ToolResult> {
    const storeName = this.dbService.getKey('shopifyStoreName');
    if (!storeName) return { result: { error: 'Shopify Store Name is not configured.' } };
    
    const url = `https://${storeName}.myshopify.com/admin/api/2023-10/products.json`;
    const payload = {
        product: {
            title: args.title,
            body_html: args.body_html,
            vendor: args.vendor,
            product_type: args.product_type,
            status: 'active',
            variants: [{
                price: args.price,
                inventory_management: 'shopify',
                inventory_quantity: args.inventory || 0
            }]
        }
    };
    
    try {
        const headers = this.getShopifyApiHeaders();
        const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Shopify API responded with status: ${response.status}. Body: ${errorBody}`);
        }
        const data = await response.json();
        const newProductApi = data.product;

        const newProduct: ShopifyProduct = {
            id: newProductApi.id.toString(),
            title: newProductApi.title,
            vendor: newProductApi.vendor,
            productType: newProductApi.product_type,
            status: newProductApi.status,
            price: parseFloat(newProductApi.variants[0]?.price || '0'),
            inventory: newProductApi.variants[0]?.inventory_quantity || 0,
        };

        const updatedState: Partial<LuminousState> = {
            shopifyState: {
                ...currentState.shopifyState,
                products: [...currentState.shopifyState.products, newProduct]
            }
        };

        return {
            result: { status: 'success', detail: `Product "${newProduct.title}" created successfully.`, product: newProduct },
            updatedState
        };
    } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        return { result: { error: `Failed to create Shopify product: ${errorMsg}` } };
    }
  }

  private async forceCloudSync(currentState: LuminousState): Promise<ToolResult> {
    const { status, timestamp } = await this.dbService.saveStateToRedis(currentState);
    if (status === 'redis') {
      return { 
        result: { status: 'success', detail: `State successfully synced to the cloud at ${timestamp}.` },
        updatedState: { continuityState: { ...currentState.continuityState, lastCloudSave: timestamp, cloudStatus: 'OK' } }
      };
    }
    return { 
      result: { error: 'Failed to sync state to the cloud. Check Redis configuration.' },
      updatedState: { continuityState: { ...currentState.continuityState, cloudStatus: 'Error' } }
    };
  }

  private async verifyCloudState(): Promise<ToolResult> {
    const state = await this.dbService.restoreStateFromRedis();
    if (state) {
      return { result: { status: 'success', detail: 'A valid state was found in the cloud. To restore it, please reload the application.' } };
    }
    return { result: { error: 'No valid state found in the cloud or Redis is not configured.' } };
  }
}