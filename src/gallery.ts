import { newDeck } from './engine.ts'
import { SPRITE, backSvg, cardSvg } from './cards.ts'

document.body.insertAdjacentHTML('afterbegin', SPRITE)
document.querySelector('#cards')!.innerHTML = newDeck().map(cardSvg).join('') + backSvg()
