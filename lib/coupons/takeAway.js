const fetch = require('../fetch')
const getPayload = require('../payload')
const { doPost } = require('./util')
const GUNDAM_ID = '2KAWnD'
const actUrl = new URL(
  `https://market.waimai.meituan.com/gd/single.html?el_biz=waimai&el_page=gundam.loader&gundam_id=${GUNDAM_ID}`
)
async function getTemplateData() {
  const text = await fetch(
    `https://market.waimai.meituan.com/api/template/get?env=current&el_biz=waimai&el_page=gundam.loader&gundam_id=${GUNDAM_ID}`
  ).then((rep) => rep.text())
  const matchGlobal = text.match(/globalData: ({.+})/)
  const matchAppJs = text.match(/https:\/\/[./_-\w]+app\.js(?=")/g)

  try {
    const globalData = JSON.parse(matchGlobal[1])

    return {
      gundamId: globalData.gdId,
      appJs: matchAppJs[0]
    }
  } catch (e) {
    throw new Error(`活动配置数据获取失败: ${e}`)
  }
}

async function grabCoupon() {
  const tmplData = await getTemplateData()
  const payload = await getPayload(tmplData.gundamId, tmplData.appJs)
  const res = await doPost('/gundam/gundamGrabV3', {
    data: payload,
    headers: {
      Origin: actUrl.origin,
      Referer: actUrl.origin + '/'
    }
  })

  if (res.code == 0) return res.data

  if (res.code == 3) {
    throw { code: ECODE.AUTH, api: 'gundamGrabV3', msg: res.msg || res.message }
  }

  throw { code: ECODE.API, api: 'gundamGrabV3', msg: res.msg || res.message }
}
module.exports = {
  grabCoupon: grabCoupon,
  getActUrl: () => actUrl
}
