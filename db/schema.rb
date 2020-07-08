# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# Note that this schema.rb definition is the authoritative source for your
# database schema. If you need to create the application database on another
# system, you should be using db:schema:load, not running all the migrations
# from scratch. The latter is a flawed and unsustainable approach (the more migrations
# you'll amass, the slower it'll run and the greater likelihood for issues).
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema.define(version: 2020_07_08_193613) do

  # These are extensions that must be enabled in order to support this database
  enable_extension "plpgsql"

  create_table "accounts", force: :cascade do |t|
    t.string "code"
    t.text "settings"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.boolean "archived"
    t.string "email_hash"
    t.index ["code"], name: "index_accounts_on_code", unique: true
    t.index ["email_hash"], name: "index_accounts_on_email_hash"
  end

  create_table "bundles", force: :cascade do |t|
    t.text "settings"
    t.string "verifier"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "pending_rooms", force: :cascade do |t|
    t.integer "account_id"
    t.text "settings"
    t.string "code"
    t.boolean "activated"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["code"], name: "index_pending_rooms_on_code", unique: true
  end

  create_table "rooms", force: :cascade do |t|
    t.integer "account_id"
    t.text "settings"
    t.datetime "started"
    t.datetime "ended"
    t.string "code"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.integer "duration"
    t.index ["account_id", "updated_at"], name: "index_rooms_on_account_id_and_updated_at"
    t.index ["code"], name: "index_rooms_on_code", unique: true
  end

end
