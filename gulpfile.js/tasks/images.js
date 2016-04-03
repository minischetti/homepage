var config      = require('../config')
if(!config.tasks.images) return

var browserSync = require('browser-sync')
var changed     = require('gulp-changed')
var gulp        = require('gulp')
var imagemin    = require('gulp-imagemin')
var pngquant = require('imagemin-pngquant');
var jpegtran = require('imagemin-jpegtran');
var gifsicle = require('imagemin-gifsicle');
var path        = require('path')

var paths = {
  src: path.join(config.root.src, config.tasks.images.src, '/**'),
  dest: path.join(config.root.dest, config.tasks.images.dest)
}

var imagesTask = function() {
  return gulp.src(paths.src)
    .pipe(
      imagemin({
	progressive: false,
	svgoPlugins: [{removeViewBox: false}],
	use: [pngquant(), jpegtran(), gifsicle()]
      })
    )
    .pipe(gulp.dest(paths.dest))
    .pipe(browserSync.stream())
}

gulp.task('images', imagesTask)
module.exports = imagesTask
