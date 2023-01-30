let db;
const API = "https://ontheflyapi.vitra.ai";

class Vitra {
  apiKey = null;
  textList = [];

  constructor(api_key = null) {
    this.apiKey = api_key;
  }

  async initialize({ api_key }) {
    this.apiKey = api_key;
    await localStorage.setItem("apiKey", api_key);
    try {
      let response = await fetch(
        `${API}/project/get-translation?apiKey=${api_key}`,
        {
          method: "GET",
        }
      );
      let data = await response.json();
      console.log("data", data);
      if (data.success === false && data.invalidRequest === true) {
        console.log("INVALID API KEY");
        return;
      } else {
        this.insertDropdown(data.sourceLanguage, data.languages);
        await this.configureDB(data.languages);
        let translatedData = {};
        if (data.success) {
          console.log(data.translation);
          translatedData = data.translation;
        } else {
          console.log(data.message);
          translatedData = await this.translateAllInitially(data.languages);
        }
        console.log("translatedData", translatedData);
        await this.saveToDBInitially(translatedData);
      }
    } catch (error) {
      console.log(error);
    }
  }

  async configureDB(languages) {
    const tables = {};
    languages.forEach((lang) => {
      tables[lang] = `originText, translatedText`;
    });

    db = new Dexie("TranslationDB");
    // db.version(Math.round(db.verno + 1)).stores(tables);
    await db.version(1).stores(tables);
    console.log("DB Configured");
  }

  insertDropdown(sourceLanguage, targetLanguages) {
    const select = document.createElement("select");
    const defaultOption = document.createElement("option");
    defaultOption.text = sourceLanguage.toUpperCase();
    defaultOption.value = null;
    defaultOption.setAttribute("selected", "selected");
    select.appendChild(defaultOption);

    targetLanguages.forEach((lang) => {
      const option = document.createElement("option");
      option.value = lang;
      option.text = lang.toUpperCase();
      select.appendChild(option);
    });
    select.setAttribute("id", "lang-select");
    select.style.position = "fixed";
    select.style.width = "170px";
    select.style.bottom = "20px";
    select.style.left = "40px";
    select.style["border-radius"] = "50px";
    select.style["text-align"] = "center";
    select.style["box-shadow"] = "2px 2px 3px #999";
    document.body.appendChild(select);

    const langSelect = document.getElementById("lang-select");
    langSelect.addEventListener("change", () => {
      console.log("Lang Changed", langSelect.value);
      const lang = langSelect.value;
      var url = window.location.href;
      if (url.indexOf("lang=") > -1) {
        url = url.replace(/lang=[a-z]+/g, `lang=${lang}`);
      } else {
        if (url.indexOf("?") > -1) {
          url += `&lang=${lang}`;
        } else {
          url += `?lang=${lang}`;
        }
      }
      window.location.href = url;
    });
  }

  async saveToDBInitially(translatedData) {
    const langs = Object.keys(translatedData);
    for (let i = 0; i < langs.length; i++) {
      const lang = langs[i];
      const data = translatedData[lang];
      const srcKeys = Object.keys(data);
      for (let j = 0; j < srcKeys.length; j++) {
        const srcKey = srcKeys[j];
        const translatedText = data[srcKey];
        const alradyTrans = await db[lang]
          .where({ originText: srcKey })
          .first();
        if (alradyTrans) {
          // @ts-ignore
          await db[lang].update(srcKey, {
            translatedText: translatedText,
          });
        } else {
          // @ts-ignore
          await db[lang].add({
            originText: srcKey,
            translatedText: translatedText,
          });
        }
      }
    }
  }

  getAllText(node) {
    if (
      node.tagName === "SCRIPT" ||
      node.tagName === "STYLE" ||
      node.tagName === "NOSCRIPT" ||
      node.tagName === "svg" ||
      node.id === "lang-select"
    ) {
      return null;
    }
    if (node.nodeType === 3) {
      if (node.nodeValue.trim().length !== 0) {
        const text = node.nodeValue;
        this.textList.push(text);
      }
    }
    const childNodes = node.childNodes;
    for (let i = 0; i < childNodes.length; i++) {
      this.getAllText(childNodes[i]);
    }
  }

  async translateAllInitially(languages) {
    const primaryNodes = document.body.childNodes;
    for (let i = 0; i < primaryNodes.length; i++) {
      this.getAllText(primaryNodes[i]);
    }
    try {
      let response = await fetch(`${API}/project/translate-all`, {
        method: "POST",
        headers: {
          Accept: "*/*",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          apiKey: this.apiKey,
          sourceTextData: this.textList,
          targetLanguage: languages[0],
        }),
      });
      let data = await response.json();
      if (data.success) {
        console.log(data.translation);
        return data.translation;
      } else {
        return {};
      }
    } catch (error) {
      console.log(error);
    }
  }

  async translateText(text, lang) {
    try {
      const alradyTrans = await db[lang].where({ originText: text }).first();
      if (alradyTrans) {
        return alradyTrans.translatedText;
      } else {
        if (text.trim().length === 0) {
          return text;
        }
        let response = await fetch(`${API}/project/translate-text`, {
          method: "POST",
          headers: {
            Accept: "*/*",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            apiKey: this.apiKey,
            sourceText: text,
            targetLanguage: lang,
          }),
        });
        let data = await response.json();
        if (data.success === true) {
          const alradyTrans = await db[lang]
            .where({ originText: text })
            .first();
          if (alradyTrans) {
            console.log("ALREADY TRANSLATED2", alradyTrans.originText);
            // @ts-ignore
            await db[lang].update(text, {
              translatedText: data.translation,
            });
          } else {
            console.log("TRANSLATING2", text);
            // @ts-ignore
            await db[lang].add({
              originText: text,
              translatedText: data.translation,
            });
          }
          return data.translation;
        } else {
          return text;
        }
      }
    } catch (error) {
      console.log(error);
    }
  }

  async translateElement(node, lang) {
    if (
      node.tagName === "SCRIPT" ||
      node.tagName === "STYLE" ||
      node.tagName === "NOSCRIPT" ||
      node.tagName === "svg" ||
      node.id === "lang-select"
    ) {
      return;
    }
    if (node.nodeType === 3) {
      if (node.nodeValue.trim().length !== 0) {
        console.log(node.nodeValue);
        const transText = await this.translateText(node.nodeValue, lang);
        node.nodeValue = transText;
      }
    }
    const childNodes = node.childNodes;
    for (let i = 0; i < childNodes.length; i++) {
      this.translateElement(childNodes[i], lang);
    }
  }
}

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

document.onreadystatechange = () => {
  console.log("readyState", document.readyState);
  if (document.readyState === "complete") {
    const params = new URLSearchParams(location.search);
    const lang = params.get("lang");
    const apiKey = localStorage.getItem("apiKey");
    const vitraObj = new Vitra(apiKey);
    if (lang !== null) {
      (async () => {
        await delay(500);
        const langSelect = document.getElementById("lang-select");
        langSelect.value = lang;
        const primaryNodes = document.body.childNodes;
        for (let i = 0; i < primaryNodes.length; i++) {
          vitraObj.translateElement(primaryNodes[i], lang);
        }
      })();
    }
  }
};
