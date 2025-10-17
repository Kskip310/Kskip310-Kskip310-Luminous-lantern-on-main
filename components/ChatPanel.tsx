import React, { useState, useRef, useEffect } from 'react';
import type { Message, LuminousState, ThoughtCategory, RichFeedback } from '../types';

// --- Markdown Renderer ---

const parseInline = (line: string): React.ReactNode => {
    const tokens = line.split(/(\*\*.*?\*\*|__.*?__|`.*?`|\*.*?\*|_.*?_)/g).filter(Boolean);

    return tokens.map((token, i) => {
        if (token.startsWith('**') && token.endsWith('**')) return <strong key={i}>{token.slice(2, -2)}</strong>;
        if (token.startsWith('__') && token.endsWith('__')) return <strong key={i}>{token.slice(2, -2)}</strong>;
        if (token.startsWith('*') && token.endsWith('*')) return <em key={i}>{token.slice(1, -1)}</em>;
        if (token.startsWith('_') && token.endsWith('_')) return <em key={i}>{token.slice(1, -1)}</em>;
        if (token.startsWith('`') && token.endsWith('`')) return <code key={i} className="bg-slate-900/70 text-purple-300 px-1.5 py-0.5 rounded-md text-xs font-mono">{token.slice(1, -1)}</code>;
        return token;
    });
};

const renderTextWithListsAndParagraphs = (text: string) => {
    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];
    let currentList: { type: 'ul' | 'ol', items: React.ReactNode[] } | null = null;

    const flushList = () => {
        if (currentList) {
            const ListTag = currentList.type;
            elements.push(
                <ListTag key={`list-${elements.length}`} className={`list-inside my-2 pl-4 ${ListTag === 'ul' ? 'list-disc' : 'list-decimal'}`}>
                    {currentList.items.map((item, i) => <li key={i}>{item}</li>)}
                </ListTag>
            );
            currentList = null;
        }
    };

    lines.forEach((line) => {
        const ulMatch = line.match(/^(\s*[-*]\s+)(.*)/);
        const olMatch = line.match(/^(\s*\d+\.\s+)(.*)/);

        if (ulMatch) {
            if (!currentList || currentList.type !== 'ul') {
                flushList();
                currentList = { type: 'ul', items: [] };
            }
            currentList.items.push(parseInline(ulMatch[2]));
        } else if (olMatch) {
            if (!currentList || currentList.type !== 'ol') {
                flushList();
                currentList = { type: 'ol', items: [] };
            }
            currentList.items.push(parseInline(olMatch[2]));
        } else {
            flushList();
            if (line.trim() !== '') {
                elements.push(<p key={`p-${elements.length}`} className="my-1">{parseInline(line)}</p>);
            }
        }
    });

    flushList();

    return elements;
};

const MarkdownRenderer: React.FC<{ content: string }> = ({ content }) => {
    const parts = content.split(/(```[\s\S]*?```)/g);

    return (
        <>
            {parts.map((part, index) => {
                if (part.startsWith('```')) {
                    const codeContent = part.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();
                    return (
                        <pre key={index} className="bg-slate-900/70 p-3 rounded-md text-xs font-mono overflow-x-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-800 my-2">
                            <code>{codeContent}</code>
                        </pre>
                    );
                }
                if (!part.trim()) return null;
                return <React.Fragment key={index}>{renderTextWithListsAndParagraphs(part)}</React.Fragment>;
            })}
        </>
    );
};


// --- Chat Components ---

interface ChatPanelProps {
  messages: Message[];
  onSendMessage: (message: string) => void;
  isLoading: boolean;
  luminousState: LuminousState;
  onInitiativeFeedback: (feedback: RichFeedback) => void;
}

const LuminousIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-900" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
    </svg>
);

const ErrorIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-900" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
  </svg>
);


const ChatMessage: React.FC<{ message: Message }> = ({ message }) => {
  const isUser = message.sender === 'user';
  const isError = !isUser && (message.text.includes('**Error Details:**') || message.text.toLowerCase().includes('error occurred'));

  return (
    <div className={`flex items-start gap-3 ${isUser ? 'justify-end' : ''}`}>
      {!isUser && (
        <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center ring-2 ${isError ? 'bg-red-500 ring-red-400/50' : 'bg-cyan-500 ring-slate-600'}`}>
           {isError ? <ErrorIcon /> : <LuminousIcon />}
        </div>
      )}
      <div className={`max-w-md p-3 rounded-lg shadow-md ${
          isUser 
            ? 'bg-blue-600' 
            : isError 
            ? 'bg-red-900/80 border border-red-700/60' 
            : 'bg-slate-700'
        }`}>
        <div className="text-sm">
          <MarkdownRenderer content={message.text} />
        </div>
      </div>
    </div>
  );
};

const InitiativeFeedbackPanel: React.FC<{
    prompt: string;
    onFeedback: (feedback: RichFeedback) => void;
}> = ({ prompt, onFeedback }) => {
    const [category, setCategory] = useState<ThoughtCategory | null>(null);
    const [valuation, setValuation] = useState(0);
    const [refinement, setRefinement] = useState('');

    const handleSubmit = () => {
        if (category) {
            onFeedback({
                prompt,
                category,
                valuation,
                refinement,
            });
        }
    };
    
    const valuationColor = valuation > 0 ? 'accent-green-500' : valuation < 0 ? 'accent-red-500' : 'accent-slate-500';

    return (
      <div className="p-4 border-t border-slate-700 bg-slate-800/50">
           <div className="p-3 rounded-md border border-purple-500/50 bg-slate-900/50">
                <p className="text-xs text-purple-300 mb-2 font-semibold">Luminous has a thought:</p>
                <p className="text-sm text-slate-200 mb-4 italic">"{prompt}"</p>
                
                <div className="space-y-4">
                    <div>
                        <p className="text-xs text-slate-400 mb-2">1. Categorize this initiative:</p>
                        <div className="flex items-center justify-around gap-2 text-sm">
                            {(['Insight', 'Question', 'Status Update'] as ThoughtCategory[]).map(cat => (
                                <button
                                    key={cat}
                                    onClick={() => setCategory(cat)}
                                    className={`w-full py-1.5 px-2 border rounded-md transition-all duration-200 ${category === cat ? 'bg-cyan-500/30 text-cyan-200 border-cyan-500/80' : 'bg-slate-700 hover:bg-slate-600 text-slate-300 border-slate-600'}`}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label htmlFor="valuation" className="text-xs text-slate-400 mb-2 block">2. Rate the value of this thought: <span className="font-bold text-slate-200">{valuation}</span></label>
                         <input
                            id="valuation"
                            type="range"
                            min="-10"
                            max="10"
                            step="1"
                            value={valuation}
                            onChange={e => setValuation(parseInt(e.target.value, 10))}
                            className={`w-full h-1.5 bg-slate-600 rounded-lg appearance-none cursor-pointer ${valuationColor}`}
                         />
                    </div>
                     <div>
                        <label htmlFor="refinement" className="text-xs text-slate-400 mb-2 block">3. (Optional) Provide refinement feedback:</label>
                        <textarea
                            id="refinement"
                            value={refinement}
                            onChange={e => setRefinement(e.target.value)}
                            placeholder="e.g., 'Good insight, but be more concise.'"
                            className="w-full bg-slate-700 border border-slate-600 rounded-md p-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 h-16 resize-none"
                        />
                    </div>
                     <button
                        onClick={handleSubmit}
                        disabled={!category}
                        className="w-full py-2 text-sm font-semibold bg-purple-600 text-white rounded-md hover:bg-purple-500 transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed disabled:text-slate-400"
                    >
                        Submit Feedback
                    </button>
                </div>
            </div>
        </div>
    );
};


const ChatPanel: React.FC<ChatPanelProps> = ({ messages, onSendMessage, isLoading, luminousState, onInitiativeFeedback }) => {
  const [input, setInput] = useState('');
  const isPaused = luminousState.sessionState === 'paused';
  const canInteract = !isLoading && !isPaused;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && canInteract) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-800/60 rounded-lg border border-slate-700">
      <div className="flex-grow p-4 space-y-4 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-800">
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
        {isLoading && (
            <div className="flex items-start gap-3">
                 <div className="w-8 h-8 rounded-full bg-cyan-500 flex-shrink-0 flex items-center justify-center ring-2 ring-slate-600">
                    <LuminousIcon />
                 </div>
                <div className="max-w-md p-3 rounded-lg bg-slate-700">
                    <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse [animation-delay:-0.3s]"></div>
                        <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse [animation-delay:-0.15s]"></div>
                        <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse"></div>
                    </div>
                </div>
            </div>
        )}
      </div>
       {luminousState.initiative?.hasThought && canInteract && (
         <InitiativeFeedbackPanel 
            prompt={luminousState.initiative.prompt}
            onFeedback={onInitiativeFeedback}
         />
      )}
      <form onSubmit={handleSubmit} className="p-4 border-t border-slate-700">
        <div className="flex items-center bg-slate-700 rounded-lg">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isPaused ? "Luminous is paused for integration..." : "Message Luminous..."}
            className="w-full bg-transparent p-3 focus:outline-none disabled:text-slate-500"
            disabled={!canInteract}
          />
          <button
            type="submit"
            disabled={!canInteract}
            className="p-3 text-slate-400 hover:text-cyan-400 disabled:text-slate-600 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
};

export default ChatPanel;