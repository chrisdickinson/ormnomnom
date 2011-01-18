var base = require('ormnomnom/backends/base'),
    BaseField = base.BaseField,
    CleanedValue = base.CleanedValue;

exports.VARCHAR = BaseField.subclass({
  cleanFormat:"'{$0.toString().replace(/'/g, \"''\")}'",
  reprFormat:'TEXT'
});

exports.INTEGER = BaseField.subclass({
cleanFormat:"{parseInt($0, 10)}",
  reprFormat:'INTEGER'
});

exports.TEXT = BaseField.subclass({
  cleanFormat:"'{$0.toString().replace(/'/g, \"''\")}'",
  reprFormat:'TEXT'
});

exports.ID = BaseField.subclass({
  cleanFormat:"{parseInt($0, 10)}",
  reprFormat:'INTEGER',
});

exports.DATETIME = BaseField.subclass({
  cleanFormat:
    "'{$0.getFullYear()}-{this.pad($0.getMonth()+1)}-{this.pad($0.getDate())} "+
    "{this.pad($0.getHours())}:{this.pad($0.getMinutes())}:{this.pad($0.getSeconds())}'",
  reprFormat:
    "text",
  toJavascript:function(value) {
    return new Date(Date.parse(value));
  }
});

exports.DATE = BaseField.subclass({
  cleanFormat:
    "'{$0.getFullYear()}-{this.pad($0.getMonth()+1)}-{this.pad($0.getDate())}'",
  reprFormat:
    "text",
  toJavascript:function(value) {
    return new Date(Date.parse(value));
  }
});

