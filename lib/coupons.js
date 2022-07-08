const qualityShop = require('./coupons/qualityShop')
const takeAwayCoupon = require('./coupons/takeAway')
const { doPost, baseApi } = require('./coupons/util')
const fetch = require('./fetch')
const getPayload = require('./payload')

const ECODE = {
  SUCC: 0,
  AUTH: 1,
  API: 2,
  NETWOEK: 3,
  RUNTIME: 4
}

function genSetCookieStr(token) {
  const domain = 'Domain=.meituan.com'
  const path = 'Path=/'
  const http = 'HttpOnly'
  const expire = 'Max-Age=3600'
  const content = token.startsWith('token=') ? token : `token=${token}`

  return [content, domain, path, http, expire].join(';')
}

async function getMTUerId() {
  const rep = await fetch('https://h5.waimai.meituan.com/waimai/mindex/home')

  const repCookie = rep.headers.get('set-cookie') || ''
  const matchArr = repCookie.match(/userId=(\w+)/) || []

  return matchArr[1] || ''
}

async function getUserInfo() {
  const res = await doPost('/gundam/gundamLogin')

  if (res.code == 0) return res.data

  if (res.code == 3) {
    throw { code: ECODE.AUTH, api: 'gundamLogin', msg: res.msg || res.message }
  }

  throw { code: ECODE.API, api: 'gundamLogin', msg: res.msg || res.message }
}

function formatCoupons(coupons) {
  return coupons.map((item) => ({
    name: item.couponName,
    etime: item.etime,
    amount: item.couponAmount,
    amountLimit: item.amountLimit,
    useCondition: item.useCondition
  }))
}

// 对手机号脱敏处理
function replacePhoneNumber(str) {
  return str.replace(/1[3456789]\d{9}/, (match) =>
    match.replace(/^(\d{3})\d{4}(\d+)/, '$1****$2')
  )
}

async function runTask() {
  try {
    // 优先检测登录状态
    const userInfo = await getUserInfo()

    const takeAwayCouponResult = await takeAwayCoupon.grabCoupon()
    const qualityShopCouponResult = await qualityShop.grabCoupon()

    const grabResult = takeAwayCouponResult.coupons.concat(
      qualityShopCouponResult.coupons
    )

    return {
      code: ECODE.SUCC,
      data: {
        user: userInfo,
        coupons: formatCoupons(grabResult)
      },
      msg: '成功'
    }
  } catch (e) {
    const data = {
      // seems no usage and references
      actUrl: takeAwayCoupon.getActUrl().href
    }
    let code, msg

    // console.log('getCoupons error', e)

    switch (e.code) {
      case ECODE.AUTH:
        code = ECODE.AUTH
        msg = '登录过期'
        break
      case fetch.ECODE.FETCH:
        code = ECODE.API
        msg = '接口异常'
        break
      case fetch.ECODE.NETWOEK:
        code = ECODE.NETWOEK
        msg = '网络异常'
        break
      default:
        code = ECODE.RUNTIME
        msg = '程序异常'
    }

    return { code, data, msg, error: e }
  }
}

/**
 * 领取优惠券
 * @param  {String} token 用户 token
 * @param  {Number} maxRetry  最大重试次数
 * @return {Promise(<Object>)} 结果
 */
async function getCoupons(token, { maxRetry = 0, httpProxy }) {
  if (!token) {
    return {
      code: ECODE.RUNTIME,
      msg: '请设置 token',
      error: ''
    }
  }

  const cookie = genSetCookieStr(token)

  fetch.cookieJar.setCookieSync(cookie, baseApi)

  if (httpProxy) {
    fetch.setProxyAgent(httpProxy)
  }

  async function main(retryTimes = 0) {
    const result = await runTask()
    const needRetry = [fetch.ECODE.NETWOEK, fetch.ECODE.API].includes(
      result.code
    )

    // 标记重试次数
    result['retryTimes'] = retryTimes

    if (!needRetry || retryTimes >= maxRetry) return result

    return main(++retryTimes)
  }

  return main()
}

module.exports = { getCoupons, ECODE }
