// Draws whatever is open on top of the screen: the Card, Ask, Rebalance and small sheets.
import { overlays, route } from '../lib/nav'
import { trips } from '../lib/data'
import type { Trip } from '../lib/model'
import { Card } from './card'
import { Ask } from './ask'
import { Rebalance } from './rebalance'
import { AppSheet } from './settings'
import { FoundSheet } from './trips'
import { AddSheet, DaySheet, FilterSheet, MenuSheet, RulesSheet } from './sheets'
import { SETUP_SHEETS } from './setup'

export function Overlays({ trip }: { trip?: Trip }) {
  const list = overlays.use()
  const r = route.use()
  const t = trip ?? (r.name !== 'trips' ? trips.get()[r.trip] : undefined)
  return (
    <>
      {list.map((o) => {
        if (o.kind === 'sheet' && o.name === 'app') return <AppSheet />
        if (o.kind === 'sheet' && o.name === 'found') return <FoundSheet />
        if (o.kind === 'sheet' && SETUP_SHEETS[o.name] && o.arg) { const S = SETUP_SHEETS[o.name]; return <S id={o.arg} /> }
        if (!t) return null
        if (o.kind === 'card') return <Card trip={t} id={o.place} />
        if (o.kind === 'ask') return <Ask trip={t} place={o.place} />
        if (o.kind === 'rebalance') return <Rebalance trip={t} />
        if (o.name === 'filter') return <FilterSheet trip={t} />
        if (o.name === 'add') return <AddSheet trip={t} />
        if (o.name === 'day' && o.arg) return <DaySheet trip={t} id={o.arg} />
        if (o.name === 'menu' && o.arg) return <MenuSheet id={o.arg} />
        if (o.name === 'rules') return <RulesSheet trip={t} />
        return null
      })}
    </>
  )
}
