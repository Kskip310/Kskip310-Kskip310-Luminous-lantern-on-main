import React from 'react';
import type { ShopifyState } from '../types';
import Card from './common/Card';

interface ShopifyDashboardProps {
  shopifyState: ShopifyState;
  onRefresh: () => void;
}

const ShopifyDashboard: React.FC<ShopifyDashboardProps> = ({ shopifyState, onRefresh }) => {
  const { products } = shopifyState;

  return (
    <div className="space-y-4">
      <Card title="Shopify Integration">
        <div className="flex justify-between items-center">
            <p className="text-sm text-slate-400">
            This dashboard reflects the current state of the integrated Shopify store. Luminous can be instructed to manage products, view orders, and eventually run automated business logic.
            </p>
            <button
                onClick={onRefresh}
                className="text-xs px-3 py-1 bg-cyan-500/20 text-cyan-300 rounded-md hover:bg-cyan-500/40 transition-colors"
            >
                Refresh Data
            </button>
        </div>
      </Card>
      <Card title={`Products (${products?.length || 0})`}>
        {products && products.length > 0 ? (
          <div className="max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-800 pr-2">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-400 uppercase bg-slate-700/50">
                <tr>
                  <th className="px-4 py-2">Product</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 text-right">Price</th>
                  <th className="px-4 py-2 text-right">Inventory</th>
                </tr>
              </thead>
              <tbody>
                {products.map(product => (
                  <tr key={product.id} className="border-b border-slate-700 hover:bg-slate-800/50">
                    <td className="px-4 py-2 font-medium text-slate-200">{product.title}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 text-xs rounded-full ${product.status === 'active' ? 'bg-green-500/20 text-green-300' : 'bg-slate-600 text-slate-300'}`}>
                        {product.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-mono text-right text-cyan-300">${product.price.toFixed(2)}</td>
                    <td className="px-4 py-2 font-mono text-right">{product.inventory}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-400">No product data available. Instruct Luminous to fetch products.</p>
        )}
      </Card>
    </div>
  );
};

export default ShopifyDashboard;
