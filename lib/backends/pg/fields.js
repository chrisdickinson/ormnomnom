var base = require('ormnomnom/backends/base'),
    BaseField = base.BaseField,
    CleanedValue = base.CleanedValue;

exports.VARCHAR = BaseField.subclass({
  cleanFormat:"'{$0.toString().replace(/'/g, \"''\")}'",
  reprFormat:'VARCHAR({this.max_length})'
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
  reprFormat:'serial',
});

exports.DATETIME = BaseField.subclass({
  cleanFormat:
    "'{$0.getFullYear()}-{this.pad($0.getMonth()+1)}-{this.pad($0.getDate())} "+
    "{this.pad($0.getHours())}:{this.pad($0.getMinutes())}:{this.pad($0.getSeconds())}'",
  reprFormat:
    "timestamp with time zone",
  toJavascript:function(value) {
    return new Date(Date.parse(value));
  }
});

exports.DATE = BaseField.subclass({
  cleanFormat:
    "'{$0.getFullYear()}-{this.pad($0.getMonth()+1)}-{this.pad($0.getDate())}'",
  reprFormat:
    "date",
  toJavascript:function(value) {
    return new Date(Date.parse(value));
  }
});
