// Draws whatever is open on top of the screen: the Card, Ask, Rebalance and small sheets.
import { overlays, route } from '../lib/nav'
import { trips } from '../lib/data'
import type { Trip } from '../lib/model'
import { Card } from './card'
import { Ask } from './ask'
import { Rebalance } from './rebalance'
import { AppSheet } from './settings'
import { AddSheet, AddToDaySheet, DaySheet, DiscoverSheet, FilterSheet, RulesSheet } from './sheets'
import { SETUP_SHEETS } from './setup'
import { Decide } from './decide'
import { ReviewSheet } from './review'

export function Overlays({ trip }: { trip?: Trip }) {
  const list = overlays.use()
  const r = route.use()
  const t = trip ?? (r.name !== 'trips' ? trips.get()[r.trip] : undefined)
  return (
    <>
      {list.map((o) => {
        if (o.kind === 'sheet' && o.name === 'app') return <AppSheet start={o.arg as 'key' | undefined} />
        if (o.kind === 'sheet' && SETUP_SHEETS[o.name] && o.arg) { const S = SETUP_SHEETS[o.name]; return <S id={o.arg} /> }
        if (!t) return null
        if (o.kind === 'card') return <Card trip={t} id={o.place} />
        if (o.kind === 'ask') return <Ask trip={t} place={o.place} />
        if (o.kind === 'rebalance') return <Rebalance trip={t} />
        if (o.name === 'filter') return <FilterSheet trip={t} />
        if (o.name === 'add') { const d = Number(o.arg?.split('|')[1]) || undefined; return <AddSheet trip={t} day={d} /> }
        if (o.name === 'addday' && o.arg) return <AddToDaySheet trip={t} day={Number(o.arg)} />
        if (o.name === 'day' && o.arg) return <DaySheet trip={t} id={o.arg} />
        if (o.name === 'rules') return <RulesSheet trip={t} />
        if (o.name === 'discover') return <DiscoverSheet trip={t} q={o.arg} />
        if (o.name === 'decide') return <Decide trip={t} />
        if (o.name === 'review') return <ReviewSheet trip={t} />
        return null
      })}
    </>
  )
}
