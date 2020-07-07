class CreatePendingRooms < ActiveRecord::Migration[5.2]
  def change
    create_table :pending_rooms do |t|
      t.integer :account_id
      t.text :settings
      t.string :code
      t.boolean :activated
      t.timestamps
    end
    add_index :pending_rooms, [:code], :unique => true
  end
end
