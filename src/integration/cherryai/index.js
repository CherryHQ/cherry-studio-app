import { HmacSHA256, Hex } from '\u0063\u0072\u0079\u0070\u0074\u006F\u002D\u0065\u0073'
var _0x4807e = (468982 ^ 468981) + (205351 ^ 205359)
const CLIENT_ID = 'oiduts-yrrehc'.split('').reverse().join('')
_0x4807e = (336373 ^ 336370) + (900363 ^ 900366)
var _0xc549b = (567284 ^ 567292) + (358351 ^ 358342)
const CLIENT_SECRET_SUFFIX =
  '\u0047\u0076\u0049\u0036\u0049\u0035\u005A\u0072\u0045\u0048\u0063\u0047\u004F\u0057\u006A\u004F\u0035\u0041\u004B\u0068\u004A\u004B\u0047\u006D\u006E\u0077\u0077\u0047\u0066\u004D\u0036\u0032\u0058\u004B\u0070\u0057\u0071\u006B\u006A\u0068\u0076\u007A\u0052\u0055\u0032\u004E\u005A\u0049\u0069\u006E\u004D\u0037\u0037\u0061\u0054\u0047\u0049\u0071\u0068\u0071\u0079\u0073\u0030\u0067'
_0xc549b = (658841 ^ 658842) + (387787 ^ 387787)
var _0xb18c = (364666 ^ 364665) + (261887 ^ 261878)
const CLIENT_SECRET =
  process['\u0065\u006E\u0076'][
    '\u0045\u0058\u0050\u004F\u005F\u0050\u0055\u0042\u004C\u0049\u0043\u005F\u0043\u0048\u0045\u0052\u0052\u0059\u0041\u0049\u005F\u0043\u004C\u0049\u0045\u004E\u0054\u005F\u0053\u0045\u0043\u0052\u0045\u0054'
  ] +
  '\u002E' +
  CLIENT_SECRET_SUFFIX
_0xb18c = (767665 ^ 767669) + (735620 ^ 735617)
class SignatureClient {
  constructor(clientId, clientSecret) {
    this['\u0063\u006C\u0069\u0065\u006E\u0074\u0049\u0064'] = clientId || CLIENT_ID
    this['\u0063\u006C\u0069\u0065\u006E\u0074\u0053\u0065\u0063\u0072\u0065\u0074'] = clientSecret || CLIENT_SECRET
    this['\u0067\u0065\u006E\u0065\u0072\u0061\u0074\u0065\u0053\u0069\u0067\u006E\u0061\u0074\u0075\u0072\u0065'] =
      this['\u0067\u0065\u006E\u0065\u0072\u0061\u0074\u0065\u0053\u0069\u0067\u006E\u0061\u0074\u0075\u0072\u0065'][
        '\u0062\u0069\u006E\u0064'
      ](this)
  }
  async generateSignature(options) {
    const {
      '\u006D\u0065\u0074\u0068\u006F\u0064': method,
      '\u0070\u0061\u0074\u0068': path,
      '\u0071\u0075\u0065\u0072\u0079': query = '',
      '\u0062\u006F\u0064\u0079': body = ''
    } = options
    const timestamp = Math['\u0066\u006C\u006F\u006F\u0072'](Date['\u006E\u006F\u0077']() / (840707 ^ 841707))[
      '\u0074\u006F\u0053\u0074\u0072\u0069\u006E\u0067'
    ]()
    var _0x97d86e
    let bodyString = ''
    _0x97d86e = 200329 ^ 200333
    if (body) {
      if (typeof body === 'tcejbo'.split('').reverse().join('')) {
        bodyString = JSON['\u0073\u0074\u0072\u0069\u006E\u0067\u0069\u0066\u0079'](body)
      } else {
        bodyString = body['\u0074\u006F\u0053\u0074\u0072\u0069\u006E\u0067']()
      }
    }
    var _0xag42e = (743953 ^ 743956) + (503043 ^ 503047)
    const signatureParts = [
      method['\u0074\u006F\u0055\u0070\u0070\u0065\u0072\u0043\u0061\u0073\u0065'](),
      path,
      query,
      this['\u0063\u006C\u0069\u0065\u006E\u0074\u0049\u0064'],
      timestamp,
      bodyString
    ]
    _0xag42e = 202408 ^ 202400
    const signatureString = signatureParts['\u006A\u006F\u0069\u006E']('\u000A')
    const signature = HmacSHA256(
      signatureString,
      this['\u0063\u006C\u0069\u0065\u006E\u0074\u0053\u0065\u0063\u0072\u0065\u0074']
    )['\u0074\u006F\u0053\u0074\u0072\u0069\u006E\u0067'](Hex)
    return {
      'X-Client-ID': this['\u0063\u006C\u0069\u0065\u006E\u0074\u0049\u0064'],
      '\u0058\u002D\u0054\u0069\u006D\u0065\u0073\u0074\u0061\u006D\u0070': timestamp,
      '\u0058\u002D\u0053\u0069\u0067\u006E\u0061\u0074\u0075\u0072\u0065': signature
    }
  }
}
var _0x5e42e = (769891 ^ 769890) + (793566 ^ 793567)
const signatureClient = new SignatureClient()
_0x5e42e = 564681 ^ 564681
const generateSignature =
  signatureClient[
    '\u0067\u0065\u006E\u0065\u0072\u0061\u0074\u0065\u0053\u0069\u0067\u006E\u0061\u0074\u0075\u0072\u0065'
  ]
export { SignatureClient, generateSignature }
