import { Store } from 'lucide-react'
import { BazaarPanel } from './panel.jsx'
import { t } from './locales.js'

const PANEL_ID = 'bazaar'
function BazaarIcon({ size }) { return <Store size={size} aria-hidden="true" /> }
export const inject = ['slots']

/** The matching sidebar id and main key replace the conversation/right sidebar. */
export function apply(ctx) {
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID }, BazaarPanel))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id: PANEL_ID, order: 30, label: () => t('title'),
  }, BazaarIcon))
}
