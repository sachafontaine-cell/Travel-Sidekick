import { describe, expect, it } from 'vitest'
import { isPhoto, nameMatch } from './photos'

describe('photo matching', () => {
  it('prefers the article named like the place', () => {
    expect(nameMatch('Louvre (highlights tour)', 'Louvre')).toBeGreaterThan(nameMatch('Louvre (highlights tour)', 'Carrousel du Louvre'))
    expect(nameMatch('Montmartre + Sacré-Cœur', 'Basilique du Sacré-Cœur de Montmartre')).toBeGreaterThan(0.8)
    expect(nameMatch('Lunch · Le Fumoir', 'Louvre')).toBe(0)
  })
  it('keeps modern photos only', () => {
    expect(isPhoto('Notre-Dame_de_Paris_2013-07-24.jpg')).toBe(true)
    expect(isPhoto('ND_de_Paris_1699.jpg')).toBe(false)
    expect(isPhoto('Paris_-_Orthophotographie_-_2018.jpg')).toBe(false)
    expect(isPhoto('Plan_du_Louvre.png')).toBe(false)
  })
})
